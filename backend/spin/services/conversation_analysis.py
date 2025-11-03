import json
import logging
import os
from typing import Dict, List

from openai import OpenAI


logger = logging.getLogger(__name__)
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def _format_conversation(messages: List[Dict[str, str]], limit: int = 10) -> str:
    """会話履歴をOpenAIに渡すために整形"""
    trimmed = messages[-limit:]
    lines = []
    for msg in trimmed:
        role_label = "営業" if msg.get("role") == "salesperson" else "顧客"
        content = msg.get("message", "").strip()
        lines.append(f"{role_label}: {content}")
    return "\n".join(lines)


def analyze_sales_message(session, conversation_history, latest_message: str) -> Dict[str, any]:
    """営業メッセージを分析し、成功率変動を算出"""
    logger.info(f"会話分析開始: Session {session.id}, 現在の成功率={session.success_probability}%")
    
    formatted_history = _format_conversation(
        [{"role": msg.role, "message": msg.message} for msg in conversation_history]
    )

    # 企業情報を詳細に取得
    company_info_text = ""
    if session.company:
        company = session.company
        company_lines = []
        company_lines.append(f"企業名: {company.company_name}")
        if company.industry:
            company_lines.append(f"業界: {company.industry}")
        if company.business_description:
            company_lines.append(f"事業内容: {company.business_description}")
        if company.location:
            company_lines.append(f"所在地: {company.location}")
        if company.employee_count:
            company_lines.append(f"従業員数: {company.employee_count}")
        if company.established_year:
            company_lines.append(f"設立年: {company.established_year}")
        
        # スクレイピングデータからテキストコンテンツを取得
        if company.scraped_data and company.scraped_data.get('text_content'):
            text_content = company.scraped_data.get('text_content', '')[:2000]
            company_lines.append(f"\n--- Webサイト情報（抜粋） ---")
            company_lines.append(text_content)
        
        company_info_text = "\n".join(company_lines)
    else:
        company_info_text = "（企業情報なし）"

    prompt = f"""あなたはB2B営業のメンターです。以下の情報をもとに、直近の営業担当者の発言が商談成功に与える影響を分析してください。

--- セッション情報 ---
業界: {session.industry}
価値提案: {session.value_proposition}
顧客像: {session.customer_persona or '未設定'}
現在の商談成功率: {session.success_probability}%

--- 企業情報（実際の顧客企業） ---
{company_info_text}

--- 会話履歴（最近） ---
{formatted_history}

--- 今回の営業担当者の発言 ---
{latest_message}
---

評価方針:
- 詳細診断モードであり、顧客企業の実際の情報に基づく深掘りが求められている
- 営業担当者の質問・提案が適切に顧客の課題を引き出そうとしているか
- 説明が一方的でないか、顧客視点で共感や問題意識を確認できているか
- 顧客企業にとっての価値や次のステップに繋がる質問になっているか
- 企業情報を活用した具体的な質問ができているか

以下の観点で評価してください：
1. 顧客状況の把握度（企業情報に基づいた適切な質問か）
2. 課題深掘りの深さ（表面的な質問でないか）
3. 提案価値との関連性（価値提案に関連した質問か）
4. 顧客視点・共感の具合（顧客の立場を理解した質問か）

出力フォーマットは必ず次のJSON形式：
{{
  "success_delta": 整数 (-5〜5),
  "reason": "今回の変動理由（1〜2文）",
  "notes": "補足があれば（任意）"
}}

success_deltaは-5〜5の整数で、プラスは成功率を上げる要素、マイナスは下げる要素を意味します。
- 非常に良い質問・提案: +4〜+5
- 良い質問・提案: +2〜+3
- 普通: 0〜+1
- 浅い質問・一方的: -2〜-1
- 不適切な質問・話題逸脱: -5〜-3
"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "あなたはB2B営業メンターです。必ずJSON形式で返答してください。"
                },
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.4,
        )
        payload = response.choices[0].message.content
        result = json.loads(payload)

        success_delta = int(result.get("success_delta", 0))
        # クランプ処理
        success_delta = max(-5, min(5, success_delta))

        return {
            "success_delta": success_delta,
            "reason": result.get("reason", ""),
            "notes": result.get("notes")
        }
    except Exception as exc:
        logger.warning("会話分析に失敗しました: %s", exc, exc_info=True)
        return {
            "success_delta": 0,
            "reason": "分析を実行できなかったため成功率は変化しませんでした。",
            "notes": None,
        }

