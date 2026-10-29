#!/usr/bin/env python3
"""
Export all-MiniLM-L6-v2 to ONNX and quantize to FP16 / INT8.
Records model sizes (FP32 / FP16 / INT8) for the competition tech note.

Usage (inside the WSL venv):
  python quantize.py <src_dir> <out_dir>
"""
import json
import os
import shutil
import sys
import time

SRC = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/models/src"))
OUT = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else os.path.expanduser("~/models/dist"))
FP32_DIR = os.path.join(OUT, "fp32")
FP16_DIR = os.path.join(OUT, "fp16")
INT8_DIR = os.path.join(OUT, "int8")

os.makedirs(FP32_DIR, exist_ok=True)
os.makedirs(FP16_DIR, exist_ok=True)
os.makedirs(INT8_DIR, exist_ok=True)

TOKENIZER_FILES = [
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "vocab.txt",
]


def copy_tokenizer(dst: str) -> None:
    for f in TOKENIZER_FILES:
        src_path = os.path.join(SRC, f)
        if os.path.exists(src_path):
            shutil.copy(src_path, os.path.join(dst, f))


def human(n: int) -> str:
    return f"{n / 1024 / 1024:.2f} MB"


def main() -> None:
    print(f"[quant] src={SRC} out={OUT}")
    t0 = time.time()

    # 1) export FP32 ONNX via optimum
    from optimum.onnxruntime import ORTModelForFeatureExtraction

    print("[quant] exporting FP32 ONNX ...")
    model = ORTModelForFeatureExtraction.from_pretrained(
        SRC, export=True, provider="CPUExecutionProvider"
    )
    model.save_pretrained(FP32_DIR)
    fp32_onnx = os.path.join(FP32_DIR, "model.onnx")
    print(f"[quant] FP32 ONNX exported in {time.time() - t0:.1f}s")

    # optimum writes a config.json; keep the original tokenizer/config for the browser
    copy_tokenizer(FP32_DIR)
    src_config = os.path.join(SRC, "config.json")
    shutil.copy(src_config, os.path.join(FP32_DIR, "config.json"))

    sizes = {"fp32": os.path.getsize(fp32_onnx)}

    # 2) FP16 conversion (same graph, float16 tensors)
    # onnxconverter_common mishandles BERT's int64->float Cast nodes;
    # onnxruntime.transformers ships a transformer-aware converter instead.
    import onnx
    from onnxruntime.transformers.float16 import convert_float_to_float16

    # Transformers.js resolves file names by dtype: fp16 -> model_fp16.onnx, q8 -> model_quantized.onnx
    print("[quant] converting FP16 ...")
    model_fp32 = onnx.load(fp32_onnx)
    model_fp16 = convert_float_to_float16(model_fp32, keep_io_types=True)
    os.makedirs(os.path.join(FP16_DIR, "onnx"), exist_ok=True)
    onnx.save(model_fp16, os.path.join(FP16_DIR, "onnx", "model_fp16.onnx"))
    shutil.copy(src_config, os.path.join(FP16_DIR, "config.json"))
    copy_tokenizer(FP16_DIR)
    sizes["fp16"] = os.path.getsize(os.path.join(FP16_DIR, "onnx", "model_fp16.onnx"))

    # 3) INT8 dynamic quantization
    from onnxruntime.quantization import QuantType, quantize_dynamic

    print("[quant] quantizing INT8 (dynamic) ...")
    os.makedirs(os.path.join(INT8_DIR, "onnx"), exist_ok=True)
    quantize_dynamic(
        fp32_onnx,
        os.path.join(INT8_DIR, "onnx", "model_quantized.onnx"),
        weight_type=QuantType.QInt8,
    )
    shutil.copy(src_config, os.path.join(INT8_DIR, "config.json"))
    copy_tokenizer(INT8_DIR)
    sizes["int8"] = os.path.getsize(os.path.join(INT8_DIR, "onnx", "model_quantized.onnx"))

    # record sizes
    records = {
        "fp32": {"bytes": sizes["fp32"], "size": human(sizes["fp32"])},
        "fp16": {
            "bytes": sizes["fp16"],
            "size": human(sizes["fp16"]),
            "ratio_vs_fp32": f"{sizes['fp16'] / sizes['fp32']:.2%}",
        },
        "int8": {
            "bytes": sizes["int8"],
            "size": human(sizes["int8"]),
            "ratio_vs_fp32": f"{sizes['int8'] / sizes['fp32']:.2%}",
        },
    }
    with open(os.path.join(OUT, "sizes.json"), "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)
    print("[quant] sizes:", json.dumps(records, ensure_ascii=False))
    print(f"[quant] DONE in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
