import argparse
import os
import sys
from contextlib import asynccontextmanager
from typing import Optional

import aiohttp
import uvicorn
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from loguru import logger
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pipecat.transports.whatsapp.api import WhatsAppWebhookRequest
from pipecat.transports.whatsapp.client import WhatsAppClient

from bot import run_bot

load_dotenv(override=True)

WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN")
WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
WHATSAPP_WEBHOOK_VERIFICATION_TOKEN = os.getenv("WHATSAPP_WEBHOOK_VERIFICATION_TOKEN")

_missing = [
    name
    for name, value in [
        ("WHATSAPP_TOKEN", WHATSAPP_TOKEN),
        ("WHATSAPP_PHONE_NUMBER_ID", WHATSAPP_PHONE_NUMBER_ID),
        ("WHATSAPP_WEBHOOK_VERIFICATION_TOKEN", WHATSAPP_WEBHOOK_VERIFICATION_TOKEN),
    ]
    if not value
]
if _missing:
    raise ValueError(f"Missing environment variables: {', '.join(_missing)}")

whatsapp_client: Optional[WhatsAppClient] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global whatsapp_client
    async with aiohttp.ClientSession() as session:
        whatsapp_client = WhatsAppClient(
            whatsapp_token=WHATSAPP_TOKEN,
            phone_number_id=WHATSAPP_PHONE_NUMBER_ID,
            session=session,
        )
        logger.info("whatsapp client ready")
        try:
            yield
        finally:
            await whatsapp_client.terminate_all_calls()
            logger.info("calls terminated")


app = FastAPI(lifespan=lifespan)


@app.get("/")
async def verify_webhook(request: Request):
    try:
        return await whatsapp_client.handle_verify_webhook_request(
            params=dict(request.query_params),
            expected_verification_token=WHATSAPP_WEBHOOK_VERIFICATION_TOKEN,
        )
    except ValueError as e:
        logger.warning(f"webhook verification failed: {e}")
        raise HTTPException(status_code=403, detail="verification failed")


@app.post("/")
async def whatsapp_webhook(body: WhatsAppWebhookRequest, background_tasks: BackgroundTasks):
    if body.object != "whatsapp_business_account":
        raise HTTPException(status_code=400, detail="invalid object type")

    async def connection_callback(connection: SmallWebRTCConnection):
        logger.info(f"incoming call, starting bot: {connection.pc_id}")
        background_tasks.add_task(run_bot, connection)

    try:
        await whatsapp_client.handle_webhook_request(body, connection_callback)
        return {"status": "success"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"webhook error: {e}")
        raise HTTPException(status_code=500, detail="internal error")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=7860)
    parser.add_argument("--verbose", "-v", action="count")
    args = parser.parse_args()

    logger.remove(0)
    logger.add(sys.stderr, level="TRACE" if args.verbose else "DEBUG")

    uvicorn.run(app, host=args.host, port=args.port, log_config=None)
