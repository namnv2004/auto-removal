import urllib.request
from pathlib import Path

def download_image(url: str, filename: str):
    output_dir = Path(__file__).parent / "samples"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / filename
    print(f"Downloading {url} to {output_path}...")
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as response, open(output_path, 'wb') as out_file:
            out_file.write(response.read())
        print(f"Successfully downloaded {filename}")
    except Exception as e:
        print(f"Failed to download {filename}: {e}")

if __name__ == "__main__":
    images = {
        "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800": "eval_coffee.jpg",
        "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=800": "eval_dog.jpg",
        "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800": "eval_car.jpg",
    }
    for url, filename in images.items():
        download_image(url, filename)
