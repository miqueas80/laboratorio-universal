Local engine dependencies (no CDN or hosted inference at runtime):

- vosk-browser 0.0.8, Apache-2.0. JavaScript bundle includes its WASM worker.
  https://github.com/ccoreilly/vosk-browser
  https://registry.npmjs.org/vosk-browser/-/vosk-browser-0.0.8.tgz
- vosk-model-small-es-0.42, Apache-2.0, AC Technologies LLC.
  https://alphacephei.com/vosk/models/vosk-model-small-es-0.42.zip
  Repackaged as USTAR inside gzip; weights unchanged. PAX tar archives failed in the browser extractor.
  License text: `v1/voice/VOSK-LICENSE`.
- ONNX Runtime Web 1.22.0, MIT, Microsoft. License: `v1/vision/ORT-LICENSE`.
  https://github.com/microsoft/onnxruntime/tree/v1.22.0
- MobileCLIP-S0, Apple, converted ONNX weights from Xenova/mobileclip_s0,
  immutable revision `757d59c9c6870a76a4b0306f05f5061bca15c39f`.
  https://huggingface.co/Xenova/mobileclip_s0/tree/757d59c9c6870a76a4b0306f05f5061bca15c39f
  Original model license retained in `v1/vision/MOBILECLIP-LICENSE`.
  https://github.com/apple/ml-mobileclip

Only the FP32 image encoder runs on the phone. Text embeddings are computed at
build time using the matching text encoder. Cosine similarity is not an accuracy
percentage. MobileCLIP proposes a category for one object and is not a trained
object detector or a chemical-identity engine. PP-OCRv6 Tiny is a separate local
text-observation engine; neither model classifies GHS pictograms.

No production inventory record or document was used as a fabricated training image.
Visual references are created explicitly by the user in a separate IndexedDB database.

PP-OCRv6 Tiny OCR models are Apache-2.0 ONNX assets published by the PaddlePaddle
organization at pinned Hugging Face revisions:

- Detection: `PaddlePaddle/PP-OCRv6_tiny_det_onnx`, revision
  `2ba1506c0380b8f0b03dd142459aac66d4421f6c`.
- Recognition: `PaddlePaddle/PP-OCRv6_tiny_rec_onnx`, revision
  `2612ab37152ae0a677521bae4e1e3d4fb4cf7c30`.
- The SHA-256 hashes of the ONNX weights and their `inference.yml` files are
  generated into `assets.js` by `scripts/offline-manifest.py`.
- Both models use the already vendored ONNX Runtime Web 1.22.0; no Paddle
  runtime, hosted inference, or model conversion is used.
