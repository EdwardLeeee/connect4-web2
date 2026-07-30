import uvicorn

if __name__ == "__main__":
    uvicorn.run("connect4_app.app:app", host="127.0.0.1", port=55555, workers=1)
