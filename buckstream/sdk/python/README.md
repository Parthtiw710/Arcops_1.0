# buckstream-client

Isomorphic, zero-dependency storage broker SDK client for BuckStream.

## Installation

```bash
pip install buckstream-client
```

## Quick Start

```python
from buckstream import BuckStreamClient

# Initialize client
client = BuckStreamClient("https://broker.yourdomain.com", "your-auth-token")

# Upload a file
result = client.Upload("photo.jpg", "uploads/photo.jpg", "image/jpeg")
print(result)

# List objects
objects = client.List()
print(objects)

# Download an object
response = client.Download("uploads/photo.jpg")
with open("downloaded_photo.jpg", "wb") as f:
    f.write(response.content)

# Delete an object
client.Delete("uploads/photo.jpg")
```
