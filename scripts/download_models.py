import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def download_sam3_1():
    from huggingface_hub import hf_hub_download

    logger.info("Downloading SAM 3.1 checkpoint from HuggingFace...")
    ckpt = hf_hub_download(
        repo_id="AEmotionStudio/sam3.1", filename="sam3.1_multiplex.pt"
    )
    logger.info("Checkpoint downloaded to: %s", ckpt)


def main():
    download_sam3_1()
    logger.info("Done")


if __name__ == "__main__":
    main()
