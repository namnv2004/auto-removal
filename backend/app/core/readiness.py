_models_ready = True


def set_models_not_ready() -> None:
    global _models_ready
    _models_ready = False


def set_models_ready() -> None:
    global _models_ready
    _models_ready = True


def are_models_ready() -> bool:
    return _models_ready
