# Copyright (c) 2026 OceanBase.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Append owner recovery storage without changing historical migration evidence."""

import json
import shutil
import sqlite3
from contextlib import closing

import pytest

from powercontext.builtin.artifacts.memory import EmbeddingProfile
from powercontext.builtin.persistence.migrations.bundle import MigrationBundle
from powercontext.builtin.persistence.migrations.deployment import server_bundle
from powercontext.builtin.persistence.migrations.sqlite import SQLiteMigrationRunner
from tests.builtin.persistence.test_portable_storage_migration import apply, configuration


@pytest.mark.parametrize("vectors", [False, True])
def test_registered_owner_recovery_upgrade_preserves_history_and_revision_checksums(tmp_path, vectors):
    embedding = EmbeddingProfile(profile_id="owner-vectors", model="fixture", dimension=3) if vectors else None
    current = server_bundle(embedding_profile=embedding)
    directory = tmp_path / "previous"
    shutil.copytree(current.directory, directory, ignore=shutil.ignore_patterns("__pycache__"))
    manifest_path = directory / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    resources = manifest["revision_resources"].pop("v1_4_1_004")
    for resource in (*resources, "versions/v1_4_1_004_owner_recovery.py", "mysql/versions/v1_4_1_004.py"):
        (directory / resource).unlink()
    del manifest["sqlite_fingerprints"]["v1_4_1_004"]
    del manifest["domain_readiness"]["v1_4_1_004"]
    manifest["mysql_state_layouts"].remove("schemas/mysql-v1_4_1_004.json")
    manifest["affected_objects"].remove("pc_access_owner_recovery")
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    previous = MigrationBundle(directory, embedding_profile=embedding)
    database = tmp_path / "managed.db"
    old = SQLiteMigrationRunner(database, previous, configuration=configuration(embedding))
    assert apply(old).revision == "s1402"
    with closing(sqlite3.connect(database)) as connection, connection:
        connection.execute(
            "INSERT INTO pc_scopes (scope_id,title,summary,scope_id_search,title_search,summary_search,version) "
            "VALUES ('original','title','summary','original','title','summary',1)"
        )
    original_evidence = json.loads(old.evidence_path.read_text(encoding="utf-8"))
    upgraded = SQLiteMigrationRunner(database, current, configuration=configuration(embedding))
    plan = upgraded.plan()
    assert plan.source_revision == "s1402" and plan.revisions == ("v1_4_1_004",)
    assert apply(upgraded).revision == "v1_4_1_004"
    assert upgraded.verify().state == "ready"
    assert not apply(upgraded).changed
    evidence = json.loads(upgraded.evidence_path.read_text(encoding="utf-8"))
    for revision, checksum in original_evidence["release_checksums"].items():
        assert evidence["release_checksums"][revision] == checksum
    with closing(sqlite3.connect(database)) as connection:
        assert connection.execute("SELECT scope_id,title,version FROM pc_scopes").fetchall() == [
            ("original", "title", 1)
        ]
        assert connection.execute("SELECT COUNT(*) FROM pc_access_owner_recovery").fetchone() == (0,)
    fresh = SQLiteMigrationRunner(tmp_path / "fresh.db", current, configuration=configuration(embedding))
    apply(fresh)
    assert upgraded.plan().schema_fingerprint == fresh.plan().schema_fingerprint
