"""
LeafLite Pipeline Smoke Test using standard library urllib
"""

import sys
import time
import json
import urllib.request
import urllib.parse
from pathlib import Path

API_URL = "http://127.0.0.1:8000"


def generate_test_image_bytes():
    from PIL import Image
    import io
    img = Image.new("RGBA", (100, 100), color=(16, 185, 129, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_full_pipeline():
    print("=" * 60)
    print("LeafLite End-to-End Pipeline Smoke Test")
    print("=" * 60)

    # 1. Health check
    print("\n[1/4] Checking API Health Check...")
    try:
        req = urllib.request.Request(f"{API_URL}/", headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as res:
            if res.status == 200:
                data = json.loads(res.read().decode())
                print(f"[OK] API is online: {data}")
            else:
                print(f"[FAIL] Health check status: {res.status}")
                return False
    except Exception as e:
        print(f"[FAIL] Cannot connect to {API_URL}: {e}")
        return False

    # 2. Upload image via multipart/form-data
    print("\n[2/4] Testing Image Upload (Target: WEBP)...")
    boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
    img_data = generate_test_image_bytes()

    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="sample_test.png"\r\n'
        f"Content-Type: image/png\r\n\r\n"
    ).encode("utf-8") + img_data + (
        f"\r\n--{boundary}\r\n"
        f'Content-Disposition: form-data; name="target_format"\r\n\r\n'
        f"WEBP\r\n"
        f"--{boundary}--\r\n"
    ).encode("utf-8")

    req = urllib.request.Request(
        f"{API_URL}/upload",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            upload_json = json.loads(res.read().decode())
            job_id = upload_json.get("job_id")
            print(f"[OK] Upload successful! Enqueued Job ID: {job_id}")
    except Exception as e:
        print(f"[FAIL] Upload failed: {e}")
        return False

    # 3. Poll Status
    print("\n[3/4] Polling Worker Status...")
    max_retries = 30
    finished = False
    status_data = {}

    for attempt in range(max_retries):
        status_req = urllib.request.Request(f"{API_URL}/status/{job_id}")
        with urllib.request.urlopen(status_req, timeout=5) as res:
            status_data = json.loads(res.read().decode())
            current_state = status_data.get("status")
            progress = status_data.get("progress", 0)

            print(f"  Attempt {attempt + 1}: State={current_state} (Progress: {progress}%)")

            if current_state == "SUCCESS":
                finished = True
                break
            elif current_state == "FAILED":
                print(f"[FAIL] Task failed on worker: {status_data.get('error')}")
                return False

        time.sleep(0.5)

    if not finished:
        print("[FAIL] Timed out waiting for worker.")
        return False

    print(f"[OK] Worker finished successfully!")
    print(f"  Original Size : {status_data.get('original_size')} bytes")
    print(f"  Optimized Size: {status_data.get('optimized_size')} bytes")
    print(f"  Savings       : {status_data.get('saved_percent')}%")

    # 4. Download File
    print("\n[4/4] Testing File Download...")
    download_url = f"{API_URL}{status_data.get('download_url')}"
    download_req = urllib.request.Request(download_url)
    with urllib.request.urlopen(download_req, timeout=10) as res:
        content = res.read()
        if res.status == 200 and len(content) > 0:
            print(f"[OK] Download successful! Received {len(content)} bytes.")
        else:
            print(f"[FAIL] Download failed ({res.status})")
            return False

    print("\n" + "=" * 60)
    print("[OK] All 4 pipeline stages passed successfully!")
    print("=" * 60)
    return True


if __name__ == "__main__":
    success = test_full_pipeline()
    sys.exit(0 if success else 1)
