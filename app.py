"""배근수정 UI 로컬 백엔드 (Flask).

MIDAS Gen NX(midas-nx SDK, https://pypi.org/project/midas-nx/)와 통신하는 로컬 서버.
브라우저 UI(templates/index.html)에서 입력한 값을 받아 실제로 Gen NX 모델의 배근을
조회(GET)/수정(PUT)한다. MAPI Key는 서버에 저장하지 않고 매 요청마다 UI에서 함께
전달받아 그대로 사용한다.

실행:
    .venv\\Scripts\\python.exe midas_rebar\\app.py
그 다음 브라우저에서 http://127.0.0.1:5050 접속.
"""
from __future__ import annotations

from flask import Flask, jsonify, request

from midas_nx import MidasAPIError, MidasClient, Product
from midas_nx.design.rc_kds.rebar import (
    ModifyBeamRebarData,
    ModifyBraceRebarData,
    ModifyColumnRebarData,
    ModifyWallRebarData,
)

app = Flask(__name__, static_folder="static", static_url_path="/static")

RESOURCE_MAP = {
    "BEAM": ModifyBeamRebarData,
    "COLUMN": ModifyColumnRebarData,
    "WALL": ModifyWallRebarData,
    "BRACE": ModifyBraceRebarData,
}


class ClientError(Exception):
    pass


def build_client(body: dict) -> MidasClient:
    mapi_key = (body.get("mapi_key") or "").strip()
    if not mapi_key:
        raise ClientError("MAPI Key를 입력하세요.")
    product = (body.get("product") or "gen").strip()
    try:
        product_enum = Product(product)
    except ValueError as exc:
        raise ClientError(f"알 수 없는 product: {product}") from exc
    base_url = (body.get("base_url") or "").strip() or None
    return MidasClient(mapi_key=mapi_key, product=product_enum, base_url=base_url)


def get_resource(member_type: str):
    resource = RESOURCE_MAP.get((member_type or "").strip().upper())
    if not resource:
        raise ClientError(f"알 수 없는 부재 유형: {member_type}")
    return resource


@app.get("/")
def index():
    return app.send_static_file("index.html")


@app.post("/api/list")
def api_list():
    body = request.get_json(force=True, silent=True) or {}
    try:
        resource = get_resource(body.get("member_type"))
        client = build_client(body)
        data = resource.get(client)
        top_key = next(iter(data), None)
        items = data.get(top_key, {}) if top_key else {}
        return jsonify(ok=True, data=items)
    except ClientError as exc:
        return jsonify(ok=False, error=str(exc)), 400
    except MidasAPIError as exc:
        return jsonify(ok=False, error=str(exc)), 400
    except Exception as exc:  # noqa: BLE001 - surface unexpected errors to the UI
        return jsonify(ok=False, error=f"예기치 않은 오류: {exc}"), 500


@app.post("/api/update")
def api_update():
    body = request.get_json(force=True, silent=True) or {}
    key = str(body.get("key") or "").strip()
    payload = body.get("payload")
    try:
        if not key:
            raise ClientError("Element/단면/Wall ID를 입력하세요.")
        if not isinstance(payload, dict):
            raise ClientError("배근 값이 비어 있습니다.")
        resource = get_resource(body.get("member_type"))
        client = build_client(body)
        result = resource.update({key: payload}, client)
        return jsonify(ok=True, data=result)
    except ClientError as exc:
        return jsonify(ok=False, error=str(exc)), 400
    except MidasAPIError as exc:
        return jsonify(ok=False, error=str(exc)), 400
    except Exception as exc:  # noqa: BLE001
        return jsonify(ok=False, error=f"예기치 않은 오류: {exc}"), 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5050, debug=True)
