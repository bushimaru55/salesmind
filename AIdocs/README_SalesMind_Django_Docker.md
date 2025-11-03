# 🧠 SalesMind（AI営業思考トレーナー）開発指示書 – Django＋Docker構成（for Cursor）

## 🎯 Goal（目的）
営業担当者がAIと模擬商談を行い、SPIN思考（状況・問題・示唆・ニーズ）を鍛えるトレーニングアプリ。  
このプロジェクトは **Django＋Docker構成** で構築し、独立開発者が単独で運用できるMVPを目指します。

---

## 🏗️ 技術スタック
| 項目 | 技術 | 補足 |
|------|------|------|
| Backend | Django 5 + Django REST Framework | APIエンドポイント構築用 |
| AI | OpenAI GPT-4o-mini | SPIN質問生成・顧客ロールプレイ・スコアリング |
| Database | PostgreSQL（開発中はSQLiteでも可） | ORM管理 |
| Infra | Docker Compose | web＋dbの2コンテナ構成 |
| Frontend（後期追加） | Next.js | MVPでは未実装可 |

---

## 📁 ディレクトリ構成
```
salesmind/
├── backend/
│   ├── Dockerfile
│   ├── manage.py
│   ├── salesmind/        ← プロジェクト設定
│   │   ├── settings.py
│   │   ├── urls.py
│   │   ├── wsgi.py
│   │   └── asgi.py
│   └── spin/             ← メインアプリ
│       ├── models.py
│       ├── serializers.py
│       ├── views.py
│       ├── urls.py
│       └── services/
│           ├── openai_client.py
│           ├── spin_prompt.py
│           └── scoring.py
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## ⚙️ Docker設定

**docker-compose.yml**
```yaml
version: "3.9"
services:
  web:
    build: ./backend
    container_name: salesmind_web
    command: >
      bash -c "python manage.py migrate &&
               python manage.py runserver 0.0.0.0:8000"
    ports:
      - "8000:8000"
    volumes:
      - ./backend:/app
    env_file:
      - .env
    depends_on:
      - db
  db:
    image: postgres:16
    container_name: salesmind_db
    environment:
      POSTGRES_DB: salesmind
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data/
volumes:
  postgres_data:
```

---

**backend/Dockerfile**
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
```

---

**.env.example**
```
DEBUG=True
SECRET_KEY=your-secret-key-here
OPENAI_API_KEY=sk-xxxxx
POSTGRES_DB=salesmind
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_HOST=db
POSTGRES_PORT=5432
```

---

## 📦 依存パッケージ
**backend/requirements.txt**
```
Django>=5.0
djangorestframework
openai
python-dotenv
psycopg2-binary
django-cors-headers
```

---

## 🔧 Django設定
**backend/salesmind/settings.py（抜粋）**
```python
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable is required")
DEBUG = os.getenv("DEBUG", "True") == "True"
ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "spin",
]
MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
]
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("POSTGRES_DB"),
        "USER": os.getenv("POSTGRES_USER"),
        "PASSWORD": os.getenv("POSTGRES_PASSWORD"),
        "HOST": os.getenv("POSTGRES_HOST"),
        "PORT": os.getenv("POSTGRES_PORT"),
    }
}
CORS_ALLOW_ALL_ORIGINS = True
STATIC_URL = "static/"
```

---

## 🔐 認証・セキュリティ設定

### 認証方式
Django標準認証を使用し、APIアクセスにはToken認証またはSession認証を利用します。

**実装方式:**
- Django REST Framework Token Authentication
- または Django Session Authentication（ブラウザベースのアクセス用）

**認証が必要なエンドポイント:**
- `POST /api/session/start` - セッション開始
- `POST /api/session/chat` - 商談対話
- `POST /api/session/finish` - セッション終了
- `GET /api/report/{id}` - レポート取得

**認証が不要なエンドポイント:**
- `POST /api/spin/generate` - SPIN質問生成（公開エンドポイント）

### ユーザー管理
Django標準の`User`モデルを使用します。

**ユーザー登録:**
- ユーザー名、メールアドレス、パスワードで登録
- 将来的にメール認証を追加可能

**ユーザー認証:**
- ログイン時にTokenを発行（Token認証の場合）
- またはセッションを作成（Session認証の場合）

### SECRET_KEY管理

**開発環境:**
- `.env`ファイルで管理
- `.env.example`にプレースホルダーのみ記載
- `.env`は`.gitignore`に追加（Gitにコミットしない）

**本番環境:**
- 環境変数として設定
- Docker ComposeやCloud Runなどの環境変数管理機能を利用

**settings.pyでの設定:**
```python
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable is required")
```

**.env.exampleの更新:**
```
DEBUG=True
SECRET_KEY=your-secret-key-here
OPENAI_API_KEY=sk-xxxxx
POSTGRES_DB=salesmind
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_HOST=db
POSTGRES_PORT=5432
```

### 権限管理
各セッション・レポートは作成したユーザーのみがアクセス可能とします。

**権限チェック:**
- `Session`モデル: `user`フィールドで所有権を管理
- `Report`モデル: 関連する`Session`の`user`を確認
- 他ユーザーのリソースへのアクセス試行時は`403 Forbidden`を返す

### セキュリティ設定

**推奨設定:**
- `DEBUG = False`（本番環境）
- `ALLOWED_HOSTS`を適切に設定（本番環境）
- CORS設定を本番環境では適切に制限
- HTTPSの利用（本番環境）

---

## 📊 データモデル設計

### Userモデル
Django標準の`User`モデルを使用し、必要に応じて`Profile`モデルで拡張可能。
- **基本フィールド**: username, email, password（Django標準）
- **拡張フィールド（Profile）**: 将来的な拡張用（MVPでは未実装可）

### Sessionモデル
商談セッション情報を管理するメインモデル。

**フィールド:**
- `id` (UUID, PrimaryKey): セッションID
- `user` (ForeignKey → User): セッションを開始したユーザー
- `industry` (CharField, max_length=100): 顧客の業界
- `value_proposition` (TextField): 営業担当者が提案する価値提案
- `customer_persona` (TextField, null=True, blank=True): 顧客像の説明
- `customer_pain` (TextField, null=True, blank=True): 顧客の課題・ペインポイント
- `status` (CharField, choices): セッション状態
  - `pending`: 開始前
  - `active`: 進行中
  - `finished`: 完了
- `started_at` (DateTimeField, auto_now_add=True): セッション開始時刻
- `finished_at` (DateTimeField, null=True, blank=True): セッション終了時刻
- `created_at` (DateTimeField, auto_now_add=True): レコード作成時刻
- `updated_at` (DateTimeField, auto_now=True): レコード更新時刻

**リレーション:**
- `User` への多対一（一ユーザーは複数セッション）
- `ChatMessage` への一対多
- `Report` への一対一

### ChatMessageモデル
商談の会話履歴を保存するモデル。

**フィールド:**
- `id` (BigAutoField, PrimaryKey): メッセージID
- `session` (ForeignKey → Session): 所属するセッション
- `role` (CharField, choices): 発言者の役割
  - `salesperson`: 営業担当者
  - `customer`: AI顧客
- `message` (TextField): メッセージ内容
- `sequence` (PositiveIntegerField): 会話順序（セッション内での順番）
- `created_at` (DateTimeField, auto_now_add=True): 発言時刻

**リレーション:**
- `Session` への多対一（一セッションは複数メッセージ）

**インデックス:**
- `(session, sequence)` の複合インデックス（会話順序での取得を高速化）

### Reportモデル
セッション終了後のスコアリング結果を保存するモデル。

**フィールド:**
- `id` (BigAutoField, PrimaryKey): レポートID
- `session` (OneToOneField → Session): 対応するセッション（一セッションにつき一レポート）
- `spin_scores` (JSONField): SPIN各要素のスコア
  ```json
  {
    "situation": 85,
    "problem": 70,
    "implication": 75,
    "need": 80,
    "total": 77.5
  }
  ```
- `feedback` (TextField): LLM生成によるフィードバック文
- `next_actions` (TextField): 次回の改善アクション
- `scoring_details` (JSONField, null=True): 詳細な評価項目（オプション）
- `created_at` (DateTimeField, auto_now_add=True): レポート作成時刻

**リレーション:**
- `Session` への一対一（一セッションにつき一レポート）

### モデル間リレーション図
```
User
 └── Session (1:N)
      ├── ChatMessage (1:N)
      └── Report (1:1)
```

---

## 🔌 API仕様（詳細）

### POST /api/spin/generate
SPIN質問を生成するエンドポイント。認証不要。

**リクエスト:**
```json
{
  "industry": "IT",
  "value_proposition": "クラウド導入支援サービス",
  "customer_persona": "中堅IT企業のCTO（オプション）",
  "customer_pain": "既存システムの保守コスト削減（オプション）"
}
```

**リクエストバリデーション:**
- `industry`: 必須、文字列、最大100文字
- `value_proposition`: 必須、文字列、最大500文字
- `customer_persona`: オプション、文字列、最大500文字
- `customer_pain`: オプション、文字列、最大500文字

**成功レスポンス (200 OK):**
```json
{
  "questions": {
    "situation": [
      "現在のシステム運用体制はどのようになっていますか？",
      "クラウド移行についてどの程度検討されていますか？"
    ],
    "problem": [
      "現在のシステム運用で最も課題に感じている点は何ですか？",
      "コスト面での課題はありますか？"
    ],
    "implication": [
      "この課題を放置すると、どのような影響がありますか？",
      "現状の課題は、事業成長にどのような影響を与えていますか？"
    ],
    "need": [
      "理想的なシステム運用の姿はどのようなものですか？",
      "どのような解決策があれば検討していただけますか？"
    ]
  }
}
```

**エラーレスポンス:**
- `400 Bad Request`: バリデーションエラー
  ```json
  {
    "error": "Validation failed",
    "details": {
      "industry": ["This field is required."],
      "value_proposition": ["This field is required."]
    }
  }
  ```
- `500 Internal Server Error`: OpenAI API呼び出しエラー
  ```json
  {
    "error": "Failed to generate SPIN questions",
    "message": "OpenAI API error details"
  }
  ```

---

### POST /api/session/start
商談セッションを開始するエンドポイント。認証必須。

**認証:**
- ヘッダー: `Authorization: Token {token}` または Djangoセッション認証

**リクエスト:**
```json
{
  "industry": "IT",
  "value_proposition": "クラウド導入支援サービス",
  "customer_persona": "中堅IT企業のCTO。コスト削減に強い関心がある",
  "customer_pain": "既存システムの保守コストが高く、リソースが足りない"
}
```

**リクエストバリデーション:**
- `industry`: 必須、文字列、最大100文字
- `value_proposition`: 必須、文字列、最大500文字
- `customer_persona`: オプション、文字列、最大500文字
- `customer_pain`: オプション、文字列、最大500文字

**成功レスポンス (201 Created):**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "active",
  "customer_persona": "中堅IT企業のCTO。コスト削減に強い関心がある",
  "started_at": "2024-01-15T10:30:00Z"
}
```

**エラーレスポンス:**
- `401 Unauthorized`: 認証エラー
  ```json
  {
    "error": "Authentication required"
  }
  ```
- `400 Bad Request`: バリデーションエラー
  ```json
  {
    "error": "Validation failed",
    "details": {
      "industry": ["This field is required."]
    }
  }
  ```

---

### POST /api/session/chat
商談セッション中にAI顧客と対話するエンドポイント。認証必須。

**認証:**
- ヘッダー: `Authorization: Token {token}` または Djangoセッション認証

**リクエスト:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "message": "現在のシステム運用体制について教えてください"
}
```

**リクエストバリデーション:**
- `session_id`: 必須、UUID形式
- `message`: 必須、文字列、最大1000文字

**成功レスポンス (200 OK):**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "conversation": [
    {
      "role": "salesperson",
      "message": "現在のシステム運用体制について教えてください",
      "created_at": "2024-01-15T10:31:00Z"
    },
    {
      "role": "customer",
      "message": "現在は3名のエンジニアが24時間365日の監視体制を取っています。コストがかかりすぎているのが課題です。",
      "created_at": "2024-01-15T10:31:05Z"
    }
  ]
}
```

**エラーレスポンス:**
- `401 Unauthorized`: 認証エラー
  ```json
  {
    "error": "Authentication required"
  }
  ```
- `404 Not Found`: セッションが見つからない
  ```json
  {
    "error": "Session not found",
    "session_id": "550e8400-e29b-41d4-a716-446655440000"
  }
  ```
- `400 Bad Request`: バリデーションエラー、またはセッションが終了済み
  ```json
  {
    "error": "Session is already finished",
    "session_id": "550e8400-e29b-41d4-a716-446655440000"
  }
  ```
- `500 Internal Server Error`: OpenAI API呼び出しエラー
  ```json
  {
    "error": "Failed to generate customer response",
    "message": "OpenAI API error details"
  }
  ```

---

### POST /api/session/finish
商談セッションを終了し、スコアリングを実行するエンドポイント。認証必須。

**認証:**
- ヘッダー: `Authorization: Token {token}` または Djangoセッション認証

**リクエスト:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**リクエストバリデーション:**
- `session_id`: 必須、UUID形式

**成功レスポンス (200 OK):**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "report_id": 123,
  "status": "finished",
  "finished_at": "2024-01-15T10:45:00Z",
  "spin_scores": {
    "situation": 85,
    "problem": 70,
    "implication": 75,
    "need": 80,
    "total": 77.5
  },
  "feedback": "状況確認は非常に適切でした。問題発見の質問をより深掘りすると効果的です。",
  "next_actions": "次回は問題の影響範囲を具体的に尋ねる質問を追加してください。"
}
```

**エラーレスポンス:**
- `401 Unauthorized`: 認証エラー
  ```json
  {
    "error": "Authentication required"
  }
  ```
- `404 Not Found`: セッションが見つからない
  ```json
  {
    "error": "Session not found"
  }
  ```
- `400 Bad Request`: セッションが既に終了済み
  ```json
  {
    "error": "Session is already finished"
  }
  ```
- `500 Internal Server Error`: スコアリング処理エラー
  ```json
  {
    "error": "Failed to generate score",
    "message": "OpenAI API error details"
  }
  ```

---

### GET /api/report/{id}
レポート詳細を取得するエンドポイント。認証必須。

**認証:**
- ヘッダー: `Authorization: Token {token}` または Djangoセッション認証

**パスパラメータ:**
- `id`: レポートID（整数）

**成功レスポンス (200 OK):**
```json
{
  "report_id": 123,
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "spin_scores": {
    "situation": 85,
    "problem": 70,
    "implication": 75,
    "need": 80,
    "total": 77.5
  },
  "feedback": "状況確認は非常に適切でした。問題発見の質問をより深掘りすると効果的です。",
  "next_actions": "次回は問題の影響範囲を具体的に尋ねる質問を追加してください。",
  "scoring_details": {
    "situation": {
      "score": 85,
      "comments": "業界の状況を適切に確認できています"
    },
    "problem": {
      "score": 70,
      "comments": "問題を発見できていますが、より具体的な質問が必要です"
    }
  },
  "created_at": "2024-01-15T10:45:00Z"
}
```

**エラーレスポンス:**
- `401 Unauthorized`: 認証エラー
  ```json
  {
    "error": "Authentication required"
  }
  ```
- `403 Forbidden`: 他ユーザーのレポートへのアクセス試行
  ```json
  {
    "error": "Permission denied"
  }
  ```
- `404 Not Found`: レポートが見つからない
  ```json
  {
    "error": "Report not found"
  }
  ```

---

### API共通仕様

**認証方式:**
- Django REST Framework Token Authentication
- または Django Session Authentication

**エラーレスポンス形式:**
すべてのエラーは以下の統一形式：
```json
{
  "error": "Error message",
  "details": {} // オプション: 詳細情報
}
```

**ステータスコード:**
- `200 OK`: 成功（GET, POST成功時）
- `201 Created`: リソース作成成功
- `400 Bad Request`: バリデーションエラー、不正なリクエスト
- `401 Unauthorized`: 認証エラー
- `403 Forbidden`: 権限エラー
- `404 Not Found`: リソースが見つからない
- `500 Internal Server Error`: サーバー内部エラー

**Content-Type:**
- リクエスト: `application/json`
- レスポンス: `application/json`

---

## 📊 スコアリングロジック詳細

### 評価項目
SPIN各要素ごとに評価を行い、総合スコアを算出します。

#### 1. Situation（状況確認）
**評価基準:**
- 業界・企業の基本情報を確認できているか（20点）
- 現在のシステム・体制を把握できているか（20点）
- 顧客の立場・役割を理解できているか（15点）
- 質問の適切性・自然さ（15点）
- 情報の深掘り度合い（30点）

**評価方法:**
- LLMが会話履歴を分析し、0-100点のスコアを付与

#### 2. Problem（問題発見）
**評価基準:**
- 顧客の課題を特定できているか（25点）
- 問題の具体的な内容を把握できているか（25点）
- 問題の優先度を理解できているか（15点）
- 質問の適切性・自然さ（15点）
- 問題の根本原因を探れているか（20点）

**評価方法:**
- LLMが会話履歴を分析し、0-100点のスコアを付与

#### 3. Implication（示唆）
**評価基準:**
- 問題の影響範囲を把握できているか（25点）
- 問題を放置した場合のリスクを明確にできているか（25点）
- 緊急性を理解できているか（15点）
- 質問の適切性・自然さ（15点）
- 顧客の感情面への影響を考慮できているか（20点）

**評価方法:**
- LLMが会話履歴を分析し、0-100点のスコアを付与

#### 4. Need（ニーズ確認）
**評価基準:**
- 顧客の理想的な解決策のイメージを把握できているか（25点）
- 顧客の予算・リソース制約を理解できているか（20点）
- 顧客の意思決定プロセスを把握できているか（15点）
- 質問の適切性・自然さ（15点）
- 具体的な次のステップへの合意形成ができているか（25点）

**評価方法:**
- LLMが会話履歴を分析し、0-100点のスコアを付与

### スコア算出式

**各要素のスコア:**
- 各要素（Situation, Problem, Implication, Need）は0-100点で評価
- LLMが会話履歴全体を分析し、各要素にスコアを付与

**総合スコア:**
```
total_score = (situation_score + problem_score + implication_score + need_score) / 4
```

**スコアレンジ:**
- `90-100`: 優秀（Excellent）
- `80-89`: 良好（Good）
- `70-79`: 普通（Average）
- `60-69`: 要改善（Below Average）
- `0-59`: 不合格（Poor）

### フィードバック形式

**フィードバック文の構造:**
1. **総評**: 全体的な評価（1-2文）
2. **各要素の評価**: SPIN各要素ごとの具体的な評価（各2-3文）
   - 良かった点
   - 改善すべき点
3. **具体的な改善提案**: 次回のセッションで意識すべきポイント（2-3点）

**フィードバック生成方法:**
- LLMが会話履歴とスコアを基に、自然な日本語でフィードバック文を生成
- 肯定的な表現を基本としつつ、建設的な改善提案を含める

### 次回アクション（Next Actions）

**内容:**
- 次回のセッションで意識すべき具体的な質問例
- 改善すべきSPIN要素の優先順位
- 推奨される質問フレーズ

**生成方法:**
- LLMがスコアが低い要素を中心に、具体的な質問例を3-5個生成

### スコアリング詳細データ（scoring_details）

各要素の詳細な評価情報を含むJSON形式：

```json
{
  "situation": {
    "score": 85,
    "comments": "業界の状況を適切に確認できています",
    "strengths": [
      "企業規模と業界の基本情報を確認できている",
      "現状のシステム運用体制を把握できている"
    ],
    "weaknesses": [
      "コスト構造の詳細な確認が不足",
      "意思決定者の特定が不十分"
    ]
  },
  "problem": {
    "score": 70,
    "comments": "問題を発見できていますが、より具体的な質問が必要です",
    "strengths": [
      "表面的な課題は特定できている"
    ],
    "weaknesses": [
      "根本原因の深掘りが不足",
      "問題の優先度の確認が不十分"
    ]
  }
}
```

---

## 💬 OpenAI連携例
**spin/services/openai_client.py**
```python
import os
from openai import OpenAI
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def generate_spin(industry, value_prop, persona=None, pain=None):
    prompt = f"""
あなたはB2B営業コーチです。
業界: {industry}
価値提案: {value_prop}
顧客像: {persona or "未設定"}
課題: {pain or "未設定"}
SPIN質問を各3〜5個ずつ日本語で生成してください。
"""
    res = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "あなたは営業コーチAIです。"},
            {"role": "user", "content": prompt},
        ],
    )
    return res.choices[0].message.content
```

---

## 🤖 OpenAIプロンプト設計基本方針

### 顧客ロールプレイ用プロンプト

**基本方針:**
- セッション開始時に顧客人格を設定
- 業界、顧客像、課題などの情報を基に、一貫した顧客キャラクターを維持
- 自然な会話を生成し、営業担当者の質問に対して適切に応答

**プロンプト構造:**
1. **システムプロンプト**: 顧客の役割と行動指針を定義
2. **ユーザープロンプト**: セッション情報（業界、顧客像、課題）を含める
3. **会話履歴**: これまでの会話をコンテキストとして含める

**顧客応答の生成方針:**
- 営業担当者の質問に対して、設定された顧客像に基づいて回答
- SPIN質問に対して適切な深さで応答（すぐに答えすぎない、抵抗を示す場合もある）
- 会話の流れに沿って自然な反応を生成

### スコアリング用プロンプト

**基本方針:**
- 会話履歴全体を分析し、SPIN各要素の評価を行う
- 各要素について具体的な評価基準に基づいてスコアを付与
- 建設的で具体的なフィードバックを生成

**プロンプト構造:**
1. **システムプロンプト**: スコアリングの役割と評価基準を定義
2. **ユーザープロンプト**: 
   - 会話履歴
   - セッション情報（業界、価値提案など）
   - 評価基準の詳細
3. **出力形式**: JSON形式で構造化された評価結果を返す

**スコアリング生成方針:**
- SPIN各要素（Situation, Problem, Implication, Need）ごとに0-100点を付与
- 各要素の強み・弱みを具体的に抽出
- 総合的なフィードバック文を自然な日本語で生成
- 次回アクションとして具体的な質問例を提示

### SPIN質問生成用プロンプト

**基本方針:**
- 業界、価値提案、顧客像、課題を基に、SPIN各要素の質問を生成
- 実際の商談で使用できる実践的な質問を生成

**プロンプト構造:**
1. **システムプロンプト**: SPIN質問生成の役割を定義
2. **ユーザープロンプト**: 
   - 業界
   - 価値提案
   - 顧客像（オプション）
   - 課題（オプション）

**出力形式:**
- SPIN各要素ごとに3-5個の質問を生成
- 自然な日本語で、実際の商談で使用可能な形式

### プロンプトテンプレート構造

**基本設計方針:**
- 各用途ごとに専用のプロンプトテンプレートを作成
- 変数を動的に埋め込む形式で実装
- プロンプトエンジニアリングのベストプラクティスに従う
  - 明確な指示
  - 具体例の提供
  - 出力形式の指定
  - 温度（temperature）パラメータの調整

**実装場所:**
- `spin/services/spin_prompt.py`: プロンプトテンプレート定義
- `spin/services/openai_client.py`: OpenAI API呼び出し
- `spin/services/scoring.py`: スコアリング用プロンプト

---

## 🧪 実行手順
```bash
docker compose build
docker compose up -d
docker compose exec web python manage.py migrate
curl -X POST http://localhost:8000/spin/generate/ -H "Content-Type: application/json" -d '{"industry":"IT","value_prop":"クラウド導入支援"}'
```

---

## 📈 開発フェーズ目安
| フェーズ | 開発項目 |
|----------|----------|
| Week 1 | Django＋Docker環境構築／SPIN生成API完成 |
| Week 2 | 対話ログ・セッション管理／スコアリング仮実装 |
| Week 3 | Django Admin導入／レポートAPI整備 |
| Week 4 | UX調整／Stripe課金・ユーザー管理検討 |

---

## 💡 開発方針
- 外部システム連携なし（独立稼働）
- MVP段階ではCLI・curl確認中心
- ローカル→ConoHa VPSまたはGCP Cloud Runへ移行可能
- Cursor Rulesと併用して自動コード生成を促す構成

---

## ✅ 最後に
このREADMEを AIdocs フォルダに配置し、Cursorで開けばAIが全体設計を自動理解します。
以降の指示例：

> 「/spin アプリのviews.pyを生成して」  
> 「OpenAI呼び出し部分を非同期化して」  
> 「スコアリングロジックを追加して」
