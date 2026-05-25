"""
Entry point so the package can be run as:
    python -m app
    python -m app --host 0.0.0.0 --port 8000 --reload
"""

import argparse


def main() -> None:
    import uvicorn

    parser = argparse.ArgumentParser(description="RAG-as-a-Service API server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--reload", action="store_true", default=False)
    parser.add_argument("--log-level", default="info")
    args = parser.parse_args()

    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level=args.log_level,
    )


if __name__ == "__main__":
    main()
