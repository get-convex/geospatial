import subprocess
import os
import base64
import tempfile

DEBUG = False

with tempfile.TemporaryDirectory() as tempdir:
    subprocess.check_call(["go", "mod", "tidy"])
    assert subprocess.check_output(["tinygo", "version"]).strip().split()[2] == b"0.33.0"

    wasm_path = os.path.join(tempdir, "s2-bindings.wasm")

    args = ["tinygo", "build", "-o", wasm_path]
    if not DEBUG:
        args.extend(["-no-debug", "-panic", "trap", "-opt", "2"])

    subprocess.check_call(
        args,
        env={"GOOS": "wasi1p", "GOARCH": "wasm", **os.environ},
    )
    with open(wasm_path, "rb") as f:
        wasm = f.read()
        with open("../component/lib/s2wasm.js", "wb") as f:
            f.write(b'export const wasmSource = "')
            f.write(base64.b64encode(wasm))
            f.write(b'";\n')
