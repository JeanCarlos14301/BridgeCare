from typing import Protocol


class EvolusProvider(Protocol):
    """Disabled integration seam. No endpoint or SDK behavior is assumed."""

    async def submit(self, payload: object) -> object:
        """TODO: define only after official API access and documentation are available."""
        ...

