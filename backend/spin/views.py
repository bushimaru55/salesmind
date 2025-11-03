from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
import json
import uuid
import logging
from .models import Session, ChatMessage, Report, Company, CompanyAnalysis
from .serializers import (
    SessionSerializer,
    ChatMessageSerializer,
    ReportSerializer,
    SpinGenerateSerializer,
    CompanySerializer,
    CompanyScrapeSerializer,
    CompanySitemapSerializer,
    CompanyAnalysisSerializer,
    CompanyAnalyzeSerializer,
)
from .services.openai_client import generate_spin as generate_spin_questions, generate_customer_response
from .services.scoring import score_conversation
from .services.scraper import scrape_company_info, scrape_multiple_urls
from .services.sitemap_parser import parse_sitemap_from_file, parse_sitemap_from_url, parse_sitemap_index
from .services.company_analyzer import analyze_spin_suitability
from .services.conversation_analysis import analyze_sales_message
from .exceptions import OpenAIAPIError, SessionNotFoundError, SessionFinishedError, NoConversationHistoryError

logger = logging.getLogger(__name__)


@api_view(['POST'])
@permission_classes([AllowAny])
def register_user(request):
    """ユーザー登録エンドポイント"""
    username = request.data.get('username')
    email = request.data.get('email')
    password = request.data.get('password')
    
    # バリデーション
    errors = {}
    if not username:
        errors['username'] = ["ユーザー名は必須です"]
    elif len(username) < 3:
        errors['username'] = ["ユーザー名は3文字以上で入力してください"]
    elif User.objects.filter(username=username).exists():
        errors['username'] = ["このユーザー名は既に使用されています"]
    
    if not password:
        errors['password'] = ["パスワードは必須です"]
    elif len(password) < 6:
        errors['password'] = ["パスワードは6文字以上で入力してください"]
    
    if email and User.objects.filter(email=email).exists():
        errors['email'] = ["このメールアドレスは既に使用されています"]
    
    if errors:
        return Response({
            "error": "Validation failed",
            "details": errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        user = User.objects.create_user(
            username=username,
            email=email or '',
            password=password
        )
        # Tokenを自動生成
        token, _ = Token.objects.get_or_create(user=user)
        
        logger.info(f"User registered: {username}")
        
        return Response({
            "message": "ユーザー登録が完了しました",
            "token": token.key,
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email
            }
        }, status=status.HTTP_201_CREATED)
    except Exception as e:
        logger.error(f"User registration failed: {e}", exc_info=True)
        return Response({
            "error": "ユーザー登録に失敗しました",
            "message": str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def login_user(request):
    """ログインエンドポイント"""
    username = request.data.get('username')
    password = request.data.get('password')
    
    # バリデーション
    if not username or not password:
        return Response({
            "error": "Validation failed",
            "details": {
                "username": ["ユーザー名は必須です"] if not username else [],
                "password": ["パスワードは必須です"] if not password else []
            }
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # 認証
    user = authenticate(username=username, password=password)
    
    if user is None:
        logger.warning(f"Login failed: invalid credentials for {username}")
        return Response({
            "error": "認証に失敗しました",
            "message": "ユーザー名またはパスワードが正しくありません"
        }, status=status.HTTP_401_UNAUTHORIZED)
    
    # Tokenを取得または作成
    token, _ = Token.objects.get_or_create(user=user)
    
    logger.info(f"User logged in: {username}")
    
    return Response({
        "message": "ログインに成功しました",
        "token": token.key,
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email
        }
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def generate_spin(request):
    """SPIN質問を生成するエンドポイント（認証不要）"""
    serializer = SpinGenerateSerializer(data=request.data)
    if serializer.is_valid():
        try:
            industry = serializer.validated_data['industry']
            value_prop = serializer.validated_data['value_proposition']
            persona = serializer.validated_data.get('customer_persona')
            pain = serializer.validated_data.get('customer_pain')
            
            # OpenAI API呼び出し
            response_text = generate_spin_questions(industry, value_prop, persona, pain)
            
            # レスポンスをパース（JSON形式を想定）
            try:
                questions = json.loads(response_text)
            except json.JSONDecodeError:
                # JSON形式でない場合は、エラーとして返す
                return Response({
                    "error": "Failed to parse OpenAI response",
                    "message": "Response is not valid JSON format"
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            return Response({"questions": questions}, status=status.HTTP_200_OK)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse OpenAI response: {e}")
            return Response({
                "error": "Failed to parse OpenAI response",
                "message": "OpenAI APIからのレスポンスがJSON形式ではありません"
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            logger.error(f"Failed to generate SPIN questions: {e}", exc_info=True)
            raise OpenAIAPIError(f"SPIN質問生成に失敗しました: {str(e)}")
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def start_session(request):
    """セッションを開始するエンドポイント"""
    serializer = SessionSerializer(data=request.data, context={'request': request})
    if serializer.is_valid():
        session = serializer.save(user=request.user, status='active')
        
        # 詳細診断モードの場合、初期成功率を50%に設定
        if session.mode == 'detailed':
            session.success_probability = 50
            session.save()
            logger.info(f"詳細診断セッション開始: Session {session.id}, 初期成功率=50%")
        
        logger.info(f"Session started: {session.id}, mode={session.mode}, user={request.user.username}")
        return Response(SessionSerializer(session).data, status=status.HTTP_201_CREATED)
    logger.warning(f"Session start validation failed: {serializer.errors}")
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def chat_session(request):
    """商談セッション中にAI顧客と対話するエンドポイント"""
    session_id = request.data.get('session_id')
    message = request.data.get('message')
    
    # バリデーション
    errors = {}
    if not session_id:
        errors['session_id'] = ["このフィールドは必須です"]
    elif session_id and not isinstance(session_id, str) and not isinstance(session_id, uuid.UUID):
        try:
            uuid.UUID(str(session_id))
        except ValueError:
            errors['session_id'] = ["有効なUUID形式で入力してください"]
    
    if not message:
        errors['message'] = ["このフィールドは必須です"]
    elif message and len(message.strip()) < 1:
        errors['message'] = ["メッセージは1文字以上で入力してください"]
    elif message and len(message.strip()) > 1000:
        errors['message'] = ["メッセージは1000文字以内で入力してください"]
    
    if errors:
        return Response({
            "error": "Validation failed",
            "details": errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        session = Session.objects.get(id=session_id, user=request.user)
    except Session.DoesNotExist:
        logger.warning(f"Session not found: {session_id}, user: {request.user.id}")
        raise SessionNotFoundError(f"セッションが見つかりません: {session_id}")
    
    if session.status != 'active':
        logger.warning(f"Session already finished: {session_id}")
        raise SessionFinishedError(f"セッションは既に終了しています: {session_id}")
    
    # 営業担当者のメッセージを保存
    messages = session.messages.all()
    sequence = messages.count() + 1
    
    salesperson_msg = ChatMessage.objects.create(
        session=session,
        role='salesperson',
        message=message,
        sequence=sequence
    )
    
    # AI顧客の応答を生成
    try:
        conversation_history = list(messages) + [salesperson_msg]
        customer_response = generate_customer_response(session, conversation_history)
        
        # AI顧客のメッセージを保存
        customer_msg = ChatMessage.objects.create(
            session=session,
            role='customer',
            message=customer_response,
            sequence=sequence + 1
        )
        
        # 詳細診断モードかつ企業情報がある場合、成功率を分析・更新
        success_probability = session.success_probability
        success_delta = 0
        analysis_reason = None
        
        if session.mode == 'detailed' and session.company:
            try:
                # 営業メッセージを分析
                analysis_result = analyze_sales_message(session, conversation_history, message)
                success_delta = analysis_result.get('success_delta', 0)
                analysis_reason = analysis_result.get('reason', '')
                
                # 成功率を更新（0-100の範囲でクリップ）
                new_probability = session.success_probability + success_delta
                success_probability = max(0, min(100, new_probability))
                
                # セッションの成功率を更新
                session.success_probability = success_probability
                session.last_analysis_reason = analysis_reason
                session.save()
                
                # 営業メッセージに分析結果を保存
                salesperson_msg.success_delta = success_delta
                salesperson_msg.analysis_summary = analysis_reason
                salesperson_msg.save()
                
                logger.info(f"成功率更新: Session {session.id}, Delta={success_delta}, New={success_probability}%")
            except Exception as e:
                logger.warning(f"成功率分析に失敗しました: {e}", exc_info=True)
                # 分析に失敗した場合は成功率は変更しない
                success_probability = session.success_probability
        
        # 最新の会話履歴を取得
        all_messages = list(session.messages.all().order_by('sequence'))
        conversation = [
            {
                "role": msg.role,
                "message": msg.message,
                "created_at": msg.created_at.isoformat()
            }
            for msg in all_messages
        ]
        
        # レスポンスデータを構築
        response_data = {
            "session_id": str(session_id),
            "conversation": conversation
        }
        
        # 詳細診断モードの場合、成功率情報を追加
        if session.mode == 'detailed':
            response_data["success_probability"] = success_probability
            response_data["success_delta"] = success_delta
            if analysis_reason:
                response_data["analysis_reason"] = analysis_reason
        
        return Response(response_data, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Failed to generate customer response: {e}", exc_info=True)
        raise OpenAIAPIError(f"AI顧客の応答生成に失敗しました: {str(e)}")


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def finish_session(request):
    """セッションを終了し、スコアリングを実行するエンドポイント"""
    session_id = request.data.get('session_id')
    
    # バリデーション
    if not session_id:
        return Response({
            "error": "Validation failed",
            "details": {
                "session_id": ["このフィールドは必須です"]
            }
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # UUID形式の検証
    if not isinstance(session_id, str) and not isinstance(session_id, uuid.UUID):
        try:
            uuid.UUID(str(session_id))
        except ValueError:
            return Response({
                "error": "Validation failed",
                "details": {
                    "session_id": ["有効なUUID形式で入力してください"]
                }
            }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        session = Session.objects.get(id=session_id, user=request.user)
    except Session.DoesNotExist:
        logger.warning(f"Session not found: {session_id}, user: {request.user.id}")
        raise SessionNotFoundError(f"セッションが見つかりません: {session_id}")
    
    if session.status == 'finished':
        logger.warning(f"Session already finished: {session_id}")
        raise SessionFinishedError("セッションは既に終了しています")
    
    # 会話履歴を取得
    conversation_history = list(session.messages.all().order_by('sequence'))
    
    if not conversation_history:
        logger.warning(f"No conversation history for session: {session_id}")
        raise NoConversationHistoryError("会話履歴がありません。まずチャットを開始してください")
    
    # スコアリングを実行
    try:
        scoring_result = score_conversation(session, conversation_history)
        scores_data = json.loads(scoring_result)
        
        # スコアリング結果を保存
        report = Report.objects.create(
            session=session,
            spin_scores={
                "situation": scores_data.get("situation", 0),
                "problem": scores_data.get("problem", 0),
                "implication": scores_data.get("implication", 0),
                "need": scores_data.get("need", 0),
                "total": scores_data.get("total", 0)
            },
            feedback=scores_data.get("feedback", ""),
            next_actions=scores_data.get("next_actions", ""),
            scoring_details=scores_data.get("scoring_details", {})
        )
        
        # セッションを終了状態に更新
        session.status = 'finished'
        session.finished_at = timezone.now()
        session.save()
        
        logger.info(f"Session finished and scored: {session_id}, total_score: {report.spin_scores.get('total', 0)}")
        return Response({
            "session_id": str(session_id),
            "report_id": report.id,
            "status": "finished",
            "finished_at": session.finished_at.isoformat(),
            "spin_scores": report.spin_scores,
            "feedback": report.feedback,
            "next_actions": report.next_actions
        }, status=status.HTTP_200_OK)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse scoring result: {e}")
        raise OpenAIAPIError("スコアリング結果の解析に失敗しました")
    except Exception as e:
        logger.error(f"Failed to generate score: {e}", exc_info=True)
        raise OpenAIAPIError(f"スコアリングに失敗しました: {str(e)}")


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_sessions(request):
    """ユーザーのセッション一覧を取得するエンドポイント"""
    sessions = Session.objects.filter(user=request.user).order_by('-created_at')
    
    # ページネーション（オプション）
    page = int(request.query_params.get('page', 1))
    page_size = int(request.query_params.get('page_size', 20))
    start = (page - 1) * page_size
    end = start + page_size
    
    sessions_page = sessions[start:end]
    
    serializer = SessionSerializer(sessions_page, many=True)
    return Response({
        "count": sessions.count(),
        "page": page,
        "page_size": page_size,
        "results": serializer.data
    }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_session(request, id):
    """セッション詳細を取得するエンドポイント"""
    try:
        session = Session.objects.get(id=id, user=request.user)
    except Session.DoesNotExist:
        logger.warning(f"Session not found: {id}, user: {request.user.id}")
        raise SessionNotFoundError(f"セッションが見つかりません: {id}")
    
    serializer = SessionSerializer(session)
    
    # 会話履歴も含める
    messages = session.messages.all().order_by('sequence')
    messages_data = ChatMessageSerializer(messages, many=True).data
    
    response_data = serializer.data
    response_data['messages'] = messages_data
    
    # レポートがある場合は含める
    try:
        report = session.report
        response_data['report'] = ReportSerializer(report).data
    except Report.DoesNotExist:
        response_data['report'] = None
    
    return Response(response_data, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_report(request, id):
    """レポート詳細を取得するエンドポイント"""
    report = get_object_or_404(Report, id=id)
    # 他ユーザーのレポートへのアクセスを防止
    if report.session.user != request.user:
        return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)
    return Response(ReportSerializer(report).data, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def scrape_company(request):
    """企業URLから情報をスクレイピングするエンドポイント（単一URL）"""
    serializer = CompanyScrapeSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        url = serializer.validated_data['url']
        value_proposition = serializer.validated_data.get('value_proposition')
        
        logger.info(f"企業スクレイピングを開始: URL={url}, User={request.user.username}")
        
        # スクレイピング実行
        company_info = scrape_company_info(url)
        
        # Companyモデルに保存
        company = Company.objects.create(
            user=request.user,
            source_url=url,
            scrape_source='url',
            company_name=company_info.get('company_name', 'Unknown'),
            industry=company_info.get('industry'),
            business_description=company_info.get('business_description'),
            location=company_info.get('location'),
            employee_count=company_info.get('employee_count'),
            established_year=company_info.get('established_year'),
            scraped_data=company_info
        )
        
        logger.info(f"企業情報を保存しました: Company ID={company.id}")
        
        # 価値提案がある場合、分析も実行
        analysis_result = None
        if value_proposition:
            try:
                analysis_result = analyze_spin_suitability(company_info, value_proposition)
                company_analysis = CompanyAnalysis.objects.create(
                    company=company,
                    user=request.user,
                    value_proposition=value_proposition,
                    spin_suitability=analysis_result.get('spin_suitability', {}),
                    recommendations=analysis_result.get('recommendations', {})
                )
                logger.info(f"企業分析を保存しました: Analysis ID={company_analysis.id}")
            except Exception as e:
                logger.warning(f"企業分析の実行に失敗しました: {e}", exc_info=True)
        
        response_data = CompanySerializer(company).data
        if analysis_result:
            response_data['analysis'] = analysis_result
        
        return Response(response_data, status=status.HTTP_201_CREATED)
    
    except ValueError as e:
        logger.error(f"スクレイピングエラー: {e}", exc_info=True)
        return Response({
            "error": "Scraping failed",
            "message": str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        logger.error(f"予期しないエラー: {e}", exc_info=True)
        return Response({
            "error": "Internal server error",
            "message": str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def scrape_from_sitemap(request):
    """sitemap.xmlからURL一覧を取得し、各URLから企業情報をスクレイピングするエンドポイント"""
    # ファイルアップロードかURL指定かを判定
    sitemap_file = request.FILES.get('sitemap_file')
    sitemap_url = request.data.get('sitemap_url')
    value_proposition = request.data.get('value_proposition')
    
    if not sitemap_file and not sitemap_url:
        return Response({
            "error": "Validation failed",
            "message": "sitemap_file または sitemap_url のいずれかが必要です"
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        logger.info(f"sitemap.xmlからの企業スクレイピングを開始: User={request.user.username}")
        
        # sitemap.xmlからURL一覧を取得
        if sitemap_file:
            # ファイルアップロードの場合
            file_content = sitemap_file.read()
            urls = parse_sitemap_from_file(file_content)
            source_url = sitemap_file.name
        else:
            # URL指定の場合
            urls = parse_sitemap_index(sitemap_url)  # sitemap indexにも対応
            source_url = sitemap_url
        
        logger.info(f"sitemap.xmlから {len(urls)} 件のURLを取得しました")
        
        if not urls:
            return Response({
                "error": "No URLs found",
                "message": "sitemap.xmlからURLが見つかりませんでした"
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # 複数URLからスクレイピング（最大50件まで）
        company_info = scrape_multiple_urls(urls, max_urls=50)
        
        # Companyモデルに保存
        company = Company.objects.create(
            user=request.user,
            source_url=source_url,
            scrape_source='sitemap',
            company_name=company_info.get('company_name', 'Unknown'),
            industry=company_info.get('industry'),
            business_description=company_info.get('business_description'),
            location=company_info.get('location'),
            employee_count=company_info.get('employee_count'),
            established_year=company_info.get('established_year'),
            scraped_urls=company_info.get('scraped_urls', []),
            scraped_data=company_info
        )
        
        logger.info(f"企業情報を保存しました: Company ID={company.id}")
        
        # 価値提案がある場合、分析も実行
        analysis_result = None
        if value_proposition:
            try:
                analysis_result = analyze_spin_suitability(company_info, value_proposition)
                company_analysis = CompanyAnalysis.objects.create(
                    company=company,
                    user=request.user,
                    value_proposition=value_proposition,
                    spin_suitability=analysis_result.get('spin_suitability', {}),
                    recommendations=analysis_result.get('recommendations', {})
                )
                logger.info(f"企業分析を保存しました: Analysis ID={company_analysis.id}")
            except Exception as e:
                logger.warning(f"企業分析の実行に失敗しました: {e}", exc_info=True)
        
        response_data = CompanySerializer(company).data
        response_data['urls_found'] = company_info.get('urls_found', 0)
        response_data['urls_scraped'] = company_info.get('urls_scraped', 0)
        response_data['urls_failed'] = company_info.get('urls_failed', 0)
        if analysis_result:
            response_data['analysis'] = analysis_result
        
        return Response(response_data, status=status.HTTP_201_CREATED)
    
    except ValueError as e:
        logger.error(f"sitemap解析エラー: {e}", exc_info=True)
        return Response({
            "error": "Sitemap parsing failed",
            "message": str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        logger.error(f"予期しないエラー: {e}", exc_info=True)
        return Response({
            "error": "Internal server error",
            "message": str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def analyze_company(request):
    """スクレイピングした企業情報を元に、SPIN提案適合性をチェックするエンドポイント"""
    serializer = CompanyAnalyzeSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        company_id = serializer.validated_data['company_id']
        value_proposition = serializer.validated_data['value_proposition']
        
        # 企業情報を取得
        company = get_object_or_404(Company, id=company_id, user=request.user)
        
        logger.info(f"企業分析を開始: Company ID={company.id}, User={request.user.username}")
        
        # 企業情報を辞書形式に変換
        company_info = {
            'company_name': company.company_name,
            'industry': company.industry,
            'business_description': company.business_description,
            'location': company.location,
            'employee_count': company.employee_count,
            'established_year': company.established_year,
            'raw_html_list': company.scraped_data.get('raw_html_list', []) if company.scraped_data else []
        }
        
        # SPIN適合性分析を実行
        analysis_result = analyze_spin_suitability(company_info, value_proposition)
        
        # CompanyAnalysisモデルに保存（既存の場合は更新）
        company_analysis, created = CompanyAnalysis.objects.update_or_create(
            company=company,
            user=request.user,
            defaults={
                'value_proposition': value_proposition,
                'spin_suitability': analysis_result.get('spin_suitability', {}),
                'recommendations': analysis_result.get('recommendations', {}),
                'analysis_details': analysis_result
            }
        )
        
        logger.info(f"企業分析を保存しました: Analysis ID={company_analysis.id}")
        
        response_data = CompanyAnalysisSerializer(company_analysis).data
        response_data['analysis'] = analysis_result
        
        return Response(response_data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
    
    except ValueError as e:
        logger.error(f"企業分析エラー: {e}", exc_info=True)
        return Response({
            "error": "Analysis failed",
            "message": str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        logger.error(f"予期しないエラー: {e}", exc_info=True)
        return Response({
            "error": "Internal server error",
            "message": str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
