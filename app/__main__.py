"""Start with python -m app on Windows or Linux."""

import uvicorn


def main() -> None:
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        loop="app.core.event_loop:loop_factory",
    )


if __name__ == "__main__":
    main()
