import subprocess
import os
import base64        

subprocess.check_call(['go', 'mod', 'tidy'])
assert subprocess.check_output(['tinygo', 'version']).strip().split()[2] == b'0.33.0'
subprocess.check_call(
    ['tinygo', 'build', '-o', '../dist/s2-bindings.wasm'],
    env={
        'GOOS': 'wasi1p',
        'GOARCH': 'wasm',
        **os.environ
    },
)
with open('../dist/s2-bindings.wasm', 'rb') as f:
    wasm = f.read()
    with open('../dist/s2-bindings.js', 'wb') as f:
        f.write(b'export const wasmSource = "')
        f.write(base64.b64encode(wasm))
        f.write(b'";\n')
