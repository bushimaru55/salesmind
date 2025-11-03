"""
スコアリング用プロンプトテンプレート
"""
import os
import logging
from openai import OpenAI

logger = logging.getLogger(__name__)
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def score_conversation(session, conversation_history):
    """会話履歴を分析してスコアリングを実行"""
    logger.info(f"スコアリング開始: Session {session.id}, メッセージ数: {len(conversation_history)}")
    # 会話履歴をテキスト形式に変換
    conversation_text = ""
    for msg in conversation_history:
        role_name = "営業担当者" if msg.role == 'salesperson' else "顧客"
        conversation_text += f"{role_name}: {msg.message}\n"
    
    # 企業情報を取得（詳細診断モードの場合）
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
        company_info_text = "\n".join(company_lines)
    
    # 企業情報セクションを準備（f-stringの制限を回避するため）
    company_info_section = ""
    company_info_note = ""
    if company_info_text:
        # f-string内でバックスラッシュを使わないようにする
        newline = "\n"
        company_info_section = f'--- 企業情報（実際の顧客企業の情報） ---{newline}{company_info_text}{newline}---'
        company_info_note = '上記の企業情報を参考に、営業担当者が実際の企業情報に基づいた適切な質問をしているかを評価してください。'
    
    prompt = f"""あなたは営業スキル評価の専門家です。以下の会話履歴を分析し、SPIN思考に基づいてスコアリングを行ってください。

セッション情報:
- 業界: {session.industry}
- 価値提案: {session.value_proposition}
- 顧客像: {session.customer_persona or '未設定'}
注意: 顧客の課題は事前に設定されていません。営業担当者が会話を通じて顧客の課題を聞き出すことが重要です。

{company_info_section}
注意: {company_info_note}

会話履歴:
{conversation_text}

以下の基準に基づいて、SPIN各要素（Situation, Problem, Implication, Need）を0-100点で評価してください。

【Situation（状況確認）の評価基準】
- 業界・企業の基本情報を確認できているか（20点）
- 現在のシステム・体制を把握できているか（20点）
- 顧客の立場・役割を理解できているか（15点）
- 質問の適切性・自然さ（15点）
- 情報の深掘り度合い（30点）

【Problem（問題発見）の評価基準】
- 顧客の課題を聞き出せているか（20点）
  * 営業担当者が顧客に対して質問を行い、顧客の課題を引き出せているか
  * 顧客から課題を聞き出すことができているか（課題が事前に分かっている必要はない）
- 特定した課題の具体的な内容を把握できているか（25点）
- 問題の優先度を理解できているか（15点）
- 質問の適切性・自然さ（15点）
- 問題の根本原因を探れているか（25点）

【Implication（示唆）の評価基準】
- 問題の影響範囲を把握できているか（25点）
- 問題を放置した場合のリスクを明確にできているか（25点）
- 緊急性を理解できているか（15点）
- 質問の適切性・自然さ（15点）
- 顧客の感情面への影響を考慮できているか（20点）

【Need（ニーズ確認）の評価基準】
- 顧客の理想的な解決策のイメージを把握できているか（25点）
- 顧客の予算・リソース制約を理解できているか（20点）
- 顧客の意思決定プロセスを把握できているか（15点）
- 質問の適切性・自然さ（15点）
- 具体的な次のステップへの合意形成ができているか（25点）

評価結果をJSON形式で返してください。必ずJSON形式で返してください。
{{
  "situation": <0-100の整数>,
  "problem": <0-100の整数>,
  "implication": <0-100の整数>,
  "need": <0-100の整数>,
  "total": <4要素の平均値>,
  "feedback": "<フィードバック文（200-300文字）>",
  "next_actions": "<次回アクション（100-200文字）>",
  "scoring_details": {{
    "situation": {{
      "score": <0-100の整数>,
      "comments": "<コメント>",
      "strengths": ["強み1", "強み2"],
      "weaknesses": ["弱み1", "弱み2"]
    }},
    "problem": {{
      "score": <0-100の整数>,
      "comments": "<コメント>",
      "strengths": ["強み1"],
      "weaknesses": ["弱み1", "弱み2"]
    }},
    "implication": {{
      "score": <0-100の整数>,
      "comments": "<コメント>",
      "strengths": ["強み1"],
      "weaknesses": ["弱み1"]
    }},
    "need": {{
      "score": <0-100の整数>,
      "comments": "<コメント>",
      "strengths": ["強み1"],
      "weaknesses": ["弱み1"]
    }}
  }}
}}
"""
    
    try:
        res = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "あなたは営業スキル評価の専門家です。必ずJSON形式で回答してください。"},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.7,
        )
        response_content = res.choices[0].message.content
        logger.info(f"スコアリング完了: Session {session.id}")
        return response_content
    except Exception as e:
        logger.error(f"スコアリングエラー: Session {session.id}, Error: {str(e)}", exc_info=True)
        raise

