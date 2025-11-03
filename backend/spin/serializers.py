from rest_framework import serializers
from .models import Session, ChatMessage, Report, Company, CompanyAnalysis
import uuid


class SpinGenerateSerializer(serializers.Serializer):
    industry = serializers.CharField(
        max_length=100,
        help_text="顧客の業界（必須、最大100文字）"
    )
    value_proposition = serializers.CharField(
        max_length=500,
        help_text="価値提案（必須、最大500文字）"
    )
    customer_persona = serializers.CharField(
        max_length=500,
        required=False,
        allow_blank=True,
        help_text="顧客像（オプション、最大500文字）"
    )
    customer_pain = serializers.CharField(
        max_length=500,
        required=False,
        allow_blank=True,
        help_text="顧客の課題（オプション、最大500文字）"
    )
    
    def validate_industry(self, value):
        """業界のバリデーション"""
        if not value or not value.strip():
            raise serializers.ValidationError("業界は必須です")
        return value.strip()
    
    def validate_value_proposition(self, value):
        """価値提案のバリデーション"""
        if not value or not value.strip():
            raise serializers.ValidationError("価値提案は必須です")
        if len(value.strip()) < 5:
            raise serializers.ValidationError("価値提案は5文字以上で入力してください")
        return value.strip()


class ChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = ['id', 'role', 'message', 'sequence', 'created_at']
        read_only_fields = ['id', 'sequence', 'created_at']


class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = ['id', 'source_url', 'scrape_source', 'company_name', 'industry', 
                  'business_description', 'location', 'employee_count', 'established_year',
                  'scraped_urls', 'scraped_data', 'scraped_at', 'created_at', 'updated_at']
        read_only_fields = ['id', 'scraped_at', 'created_at', 'updated_at']


class SessionSerializer(serializers.ModelSerializer):
    company_id = serializers.UUIDField(write_only=True, required=False, allow_null=True, help_text="企業情報のID（詳細診断モード用）")
    company = CompanySerializer(read_only=True)
    industry = serializers.CharField(max_length=100, required=False, allow_blank=True, help_text="業界（企業情報がある場合はオプショナル）")
    
    class Meta:
        model = Session
        fields = ['id', 'user', 'industry', 'value_proposition', 'customer_persona', 
                  'customer_pain', 'status', 'started_at', 'finished_at', 'created_at',
                  'company_id', 'company', 'company_analysis']
        read_only_fields = ['id', 'user', 'status', 'started_at', 'finished_at', 'created_at', 'company', 'company_analysis']
    
    def validate_industry(self, value):
        """業界のバリデーション（企業情報がある場合は空でもOK）"""
        # 空文字の場合は空文字として返す（company_idがある場合は企業情報から取得される）
        return value.strip() if value else ''
    
    def validate(self, attrs):
        """全体バリデーション（company_idがある場合は業界をオプショナルにする）"""
        company_id = attrs.get('company_id')
        industry = attrs.get('industry', '')
        
        # company_idがない場合、業界は必須
        if not company_id and (not industry or not industry.strip()):
            raise serializers.ValidationError({"industry": "業界は必須です（企業情報がない場合）"})
        
        return attrs
    
    def validate_value_proposition(self, value):
        """価値提案のバリデーション"""
        if not value or not value.strip():
            raise serializers.ValidationError("価値提案は必須です")
        if len(value.strip()) < 5:
            raise serializers.ValidationError("価値提案は5文字以上で入力してください")
        return value.strip()
    
    def create(self, validated_data):
        company_id = validated_data.pop('company_id', None)
        validated_data['id'] = uuid.uuid4()
        validated_data['status'] = 'active'
        
        # 企業情報がある場合、セッションに紐付ける
        if company_id:
            try:
                company = Company.objects.get(id=company_id, user=self.context['request'].user)
                validated_data['company'] = company
                
                # 企業情報から業界を取得（業界が空の場合）
                if not validated_data.get('industry'):
                    validated_data['industry'] = company.industry or '未設定'
                
                # 企業情報に分析結果がある場合は紐付け
                try:
                    company_analysis = CompanyAnalysis.objects.get(company=company)
                    validated_data['company_analysis'] = company_analysis
                except CompanyAnalysis.DoesNotExist:
                    # 分析結果がない場合はスキップ
                    pass
            except Company.DoesNotExist:
                raise serializers.ValidationError({"company_id": "指定された企業情報が見つかりません"})
        
        return super().create(validated_data)


class ReportSerializer(serializers.ModelSerializer):
    session_id = serializers.UUIDField(source='session.id', read_only=True)
    
    class Meta:
        model = Report
        fields = ['id', 'session_id', 'spin_scores', 'feedback', 'next_actions', 
                  'scoring_details', 'created_at']
        read_only_fields = ['id', 'created_at']


class CompanyScrapeSerializer(serializers.Serializer):
    url = serializers.URLField(help_text="企業URL（必須）")
    value_proposition = serializers.CharField(
        max_length=500,
        required=False,
        allow_blank=True,
        help_text="価値提案（オプション、提案チェック用）"
    )
    
    def validate_url(self, value):
        """URLのバリデーション"""
        if not value or not value.strip():
            raise serializers.ValidationError("URLは必須です")
        return value.strip()


class CompanySitemapSerializer(serializers.Serializer):
    sitemap_url = serializers.URLField(
        required=False,
        allow_blank=True,
        help_text="sitemap.xmlのURL（ファイルアップロードの場合不要）"
    )
    value_proposition = serializers.CharField(
        max_length=500,
        required=False,
        allow_blank=True,
        help_text="価値提案（オプション、提案チェック用）"
    )
    
    def validate(self, attrs):
        """バリデーション"""
        # sitemap_urlかsitemap_fileのどちらかが必要
        if not attrs.get('sitemap_url'):
            # ファイルアップロードの場合は、views側で処理
            pass
        return attrs


class CompanyAnalysisSerializer(serializers.ModelSerializer):
    company_id = serializers.UUIDField(source='company.id', read_only=True)
    company_name = serializers.CharField(source='company.company_name', read_only=True)
    
    class Meta:
        model = CompanyAnalysis
        fields = ['id', 'company_id', 'company_name', 'value_proposition', 
                  'spin_suitability', 'recommendations', 'analysis_details',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class CompanyAnalyzeSerializer(serializers.Serializer):
    company_id = serializers.UUIDField(help_text="企業ID（必須）")
    value_proposition = serializers.CharField(
        max_length=500,
        help_text="価値提案（必須）"
    )
    
    def validate_company_id(self, value):
        """企業IDのバリデーション"""
        if not value:
            raise serializers.ValidationError("企業IDは必須です")
        return value
    
    def validate_value_proposition(self, value):
        """価値提案のバリデーション"""
        if not value or not value.strip():
            raise serializers.ValidationError("価値提案は必須です")
        if len(value.strip()) < 5:
            raise serializers.ValidationError("価値提案は5文字以上で入力してください")
        return value.strip()
