import os
import requests

class BuckStreamClient:
    def __init__(self, broker_url: str, auth_token: str = None):
        self.broker_url = broker_url.rstrip("/")
        self.auth_token = auth_token
        self.headers = {"Authorization": f"Bearer {auth_token}"} if auth_token else {}

    def Upload(self, file_path: str, filename: str, contentType: str) -> dict:
        # Determine file size
        file_size = os.path.getsize(file_path)

        # Step 1: Request Upload Intent
        headers = {"Content-Type": "application/json"}
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"

        intent_response = requests.post(
            f"{self.broker_url}/api/upload-intent",
            headers=headers,
            json={
                "filename": filename,
                "content_type": contentType,
                "size": file_size,
            }
        )
        intent_response.raise_for_status()
        intent_data = intent_response.json()

        action = intent_data.get("action")
        upload_url = intent_data.get("upload_url")

        # Resolve target URL (proxy routes are relative path strings)
        target_url = f"{self.broker_url}{upload_url}" if action == "proxy" else upload_url

        # Step 2: Upload raw file stream
        upload_headers = {"Content-Type": contentType}
        if action == "proxy" and self.auth_token:
            upload_headers["Authorization"] = f"Bearer {self.auth_token}"

        with open(file_path, "rb") as f:
            upload_response = requests.put(
                target_url,
                headers=upload_headers,
                data=f
            )
            upload_response.raise_for_status()

        return {
            "status": "success",
            "key": filename,
            "action": action,
        }

    def Download(self, key: str) -> requests.Response:
        headers = {}
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"

        response = requests.get(
            f"{self.broker_url}/api/download/{key}",
            headers=headers,
            stream=True
        )
        response.raise_for_status()
        return response

    def List(self) -> dict:
        headers = {}
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"

        response = requests.get(
            f"{self.broker_url}/api/list",
            headers=headers
        )
        response.raise_for_status()
        return response.json()

    def Delete(self, key: str) -> dict:
        target_key = key if key.startswith("uploads/") else f"uploads/{key}"
        headers = {}
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"

        response = requests.delete(
            f"{self.broker_url}/api/delete",
            params={"key": target_key},
            headers=headers
        )
        response.raise_for_status()
        return response.json()
