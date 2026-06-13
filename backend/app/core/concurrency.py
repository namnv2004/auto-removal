import asyncio

# Global lock to serialize all heavy GPU/VRAM-intensive operations (SAM & SD)
gpu_lock = asyncio.Lock()
