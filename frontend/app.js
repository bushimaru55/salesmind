// API設定
const API_BASE_URL = 'http://localhost:8000/api';
let authToken = localStorage.getItem('authToken');
let currentSessionId = null;
let currentReportId = null;
let currentMode = localStorage.getItem('currentMode') || null; // 'simple' or 'detailed'
let currentCompanyId = null; // 取得した企業情報のIDを保持
let currentCompanyInfo = null; // 取得した企業情報の内容を保存

// ページロード時の処理
window.onload = function() {
    // ロガーを初期化（logger.jsで自動的に初期化される）
    if (window.logger) {
        window.logger.info('SalesMindアプリケーションが起動しました');
    }
    checkAuth();
    initMode();
};

// モード初期化
function initMode() {
    // 既にモードが選択されている場合は、そのモードの最初のステップを表示
    if (currentMode) {
        if (currentMode === 'simple') {
            showStep('step1-simple'); // 簡易診断モードのステップ1
        } else if (currentMode === 'detailed') {
            showStep('step1-detailed'); // 詳細診断モードのステップ1（企業情報取得）
        }
    } else {
        // モード未選択の場合は、モード選択画面を表示
        showStep(0);
    }
}

// モード選択
function selectMode(mode) {
    if (window.logger) {
        window.logger.info('モードを選択', { mode });
    }
    
    currentMode = mode;
    localStorage.setItem('currentMode', mode);

    // 詳細診断モードで保持していた企業情報をリセット
    if (mode === 'simple') {
        currentCompanyId = null;
        currentCompanyInfo = null;

        const companySummary = document.getElementById('companySummary');
        if (companySummary) {
            companySummary.remove();
        }

        const companyInfoResult = document.getElementById('companyInfoResult');
        if (companyInfoResult) {
            companyInfoResult.style.display = 'none';
            companyInfoResult.innerHTML = '';
        }
    }
    
    if (mode === 'simple') {
        // 簡易診断モードの最初のステップへ
        showStep('step1-simple');
    } else if (mode === 'detailed') {
        // 詳細診断モードの最初のステップへ（企業情報取得）
        showStep('step1-detailed');
    }
}

// モード選択画面に戻る
function returnToModeSelection() {
    if (window.logger) {
        window.logger.info('モード選択画面に戻る');
    }
    
    // セッションが進行中の場合は確認を求める
    if (currentSessionId) {
        const confirmed = confirm(
            'セッションが進行中です。モード選択に戻ると、現在のセッションが中断されます。\n\n' +
            '本当にモード選択に戻りますか？'
        );
        
        if (!confirmed) {
            return;
        }
    }
    
    // モードとセッション情報をリセット
    currentMode = null;
    currentSessionId = null;
    currentReportId = null;
    currentCompanyId = null;
    currentCompanyInfo = null;
    
    localStorage.removeItem('currentMode');
    
    // モード選択画面に戻る
    showStep(0);
    
    // 状態をリセット
    resetToStep1();
    
    if (window.logger) {
        window.logger.info('モード選択画面に戻りました');
    }
}

// 認証状態の確認
function checkAuth() {
    if (authToken) {
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('userInfo').style.display = 'block';
        document.getElementById('usernameDisplay').textContent = localStorage.getItem('username') || 'ユーザー';
        // Tokenが有効か確認（実際の実装ではAPIで確認）
    }
}

// ログインタブ表示
function showLoginTab() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
}

// 登録タブ表示
function showRegisterTab() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
}

// ユーザー登録
async function register() {
    if (window.logger) {
        window.logger.info('ユーザー登録を開始');
    }
    const username = document.getElementById('registerUsername').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    
    if (!username || !password) {
        showError('registerError', 'ユーザー名とパスワードは必須です');
        return;
    }
    
    if (username.length < 3) {
        showError('registerError', 'ユーザー名は3文字以上で入力してください');
        return;
    }
    
    if (password.length < 6) {
        showError('registerError', 'パスワードは6文字以上で入力してください');
        return;
    }
    
    // エラーメッセージをクリア
    document.getElementById('registerError').style.display = 'none';
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/register/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username,
                email: email || '',
                password
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // 登録成功 - Tokenを保存
            authToken = data.token;
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('username', data.user.username);
            
            showSuccess('ユーザー登録が完了しました');
            
            // ログイン状態にする
            document.getElementById('loginForm').style.display = 'none';
            document.getElementById('registerForm').style.display = 'none';
            document.getElementById('userInfo').style.display = 'block';
            document.getElementById('usernameDisplay').textContent = data.user.username;
        } else {
            // エラー表示
            let errorMsg = 'ユーザー登録に失敗しました';
            if (data.details) {
                const errors = Object.values(data.details).flat();
                errorMsg = errors.join('\n');
            } else if (data.message) {
                errorMsg = data.message;
            }
            showError('registerError', errorMsg);
        }
    } catch (error) {
        let errorMsg = 'エラーが発生しました: ' + error.message;
        if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
            errorMsg = 'サーバーに接続できませんでした。\nバックエンドサーバー（http://localhost:8000）が起動しているか確認してください。';
        } else if (error.message.includes('ERR_EMPTY_RESPONSE')) {
            errorMsg = 'サーバーから応答がありませんでした。\nバックエンドサーバーのターミナルでエラーメッセージを確認してください。';
        }
        if (window.logger) {
            window.logger.error('ユーザー登録エラー', { message: error.message, stack: error.stack, errorType: error.name });
        }
        showError('registerError', errorMsg);
    }
}

// ログイン
async function login() {
    if (window.logger) {
        window.logger.info('ログインを開始');
    }
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!username || !password) {
        showError('loginError', 'ユーザー名とパスワードを入力してください');
        return;
    }
    
    // エラーメッセージをクリア
    document.getElementById('loginError').style.display = 'none';
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/login/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username,
                password
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // ログイン成功 - Tokenを保存
            authToken = data.token;
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('username', data.user.username);
            
            showSuccess('ログインに成功しました');
            
            // ログイン状態にする
            document.getElementById('loginForm').style.display = 'none';
            document.getElementById('registerForm').style.display = 'none';
            document.getElementById('userInfo').style.display = 'block';
            document.getElementById('usernameDisplay').textContent = data.user.username;
        } else {
            // エラー表示
            let errorMsg = 'ログインに失敗しました';
            if (data.message) {
                errorMsg = data.message;
            }
            showError('loginError', errorMsg);
        }
    } catch (error) {
        showError('loginError', 'エラーが発生しました: ' + error.message);
    }
}

// ログアウト
function logout() {
    authToken = null;
    currentMode = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('username');
    localStorage.removeItem('currentMode');
    
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('userInfo').style.display = 'none';
    
    // モード選択画面に戻る
    showStep(0);
    resetToStep1();
}

// 診断開始（簡易診断モード用：セッション開始＋チャット画面へ直接遷移）
async function startDiagnosis() {
    // トークンを最新の状態で取得
    authToken = localStorage.getItem('authToken');
    
    if (!authToken) {
        alert('ログインしてください');
        showStep(0); // ログイン画面に戻る
        return;
    }
    
    const industry = document.getElementById('industry').value.trim();
    const value_proposition = document.getElementById('value_proposition').value.trim();
    const customer_persona = document.getElementById('customer_persona').value.trim();
    
    if (window.logger) {
        window.logger.info('診断開始（簡易診断モード）', { industry, value_proposition, customer_persona });
    }
    
    if (!industry || !value_proposition) {
        if (window.logger) {
            window.logger.warning('診断開始: 必須項目が不足しています', { industry, value_proposition });
        }
        alert('業界と価値提案は必須です');
        return;
    }
    
    showLoading('diagnosisStartResult');
    
    try {
        // セッションを開始
        const response = await fetch(`${API_BASE_URL}/session/start/`, {
            method: 'POST',
            headers: {
                'Authorization': `Token ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                mode: 'simple',  // 明示的にmodeを指定
                industry,
                value_proposition,
                customer_persona: customer_persona || undefined,
                customer_pain: null // 顧客の課題は聞き出すべきなので、入力しない
            })
        });
        
        // 401エラーの場合は、JSON解析前にチェック
        if (response.status === 401) {
            // 認証エラー - トークンをクリアしてログイン画面に戻る
            authToken = null;
            localStorage.removeItem('authToken');
            localStorage.removeItem('username');
            
            if (window.logger) {
                window.logger.warning('認証エラー（401）: トークンが無効です。ログイン画面に戻ります。');
            }
            
            alert('ログインセッションが期限切れです。再度ログインしてください。');
            logout(); // ログアウト処理で画面をリセット
            return;
        }
        
        const data = await response.json();
        
        if (response.ok) {
            currentSessionId = data.id;
            currentCompanyId = null; // 簡易診断モードでは企業情報なし
            
            if (window.logger) {
                window.logger.info('セッション開始成功、チャット画面へ遷移', { sessionId: currentSessionId });
            }
            
            // 直接チャット画面へ遷移
            showStep(3);
            loadChatHistory();
        } else {
            // バリデーションエラーなどの場合
            let errorMsg = 'セッション開始に失敗しました';
            if (data.industry) {
                errorMsg += ': ' + (Array.isArray(data.industry) ? data.industry[0] : data.industry);
            } else if (data.value_proposition) {
                errorMsg += ': ' + (Array.isArray(data.value_proposition) ? data.value_proposition[0] : data.value_proposition);
            } else if (data.mode) {
                errorMsg += ': ' + (Array.isArray(data.mode) ? data.mode[0] : data.mode);
            } else if (data.message) {
                errorMsg += ': ' + data.message;
            } else if (data.error) {
                errorMsg += ': ' + data.error;
            }
            
            if (window.logger) {
                window.logger.error('セッション開始エラー', { status: response.status, data });
            }
            
            showError('diagnosisStartResult', errorMsg);
        }
    } catch (error) {
        let errorMsg = 'エラーが発生しました: ' + error.message;
        if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
            errorMsg = 'サーバーに接続できませんでした。\nバックエンドサーバー（http://localhost:8000）が起動しているか確認してください。';
        }
        if (window.logger) {
            window.logger.error('診断開始エラー', { mode: currentMode, message: error.message, stack: error.stack, errorType: error.name });
        }
        showError('diagnosisStartResult', errorMsg);
    }
}

async function fetchCompanyInfo() {
    if (!authToken) {
        alert('ログインしてください');
        return;
    }
    
    const company_url = document.getElementById('company_url').value.trim();
    const value_proposition = document.getElementById('detailed_value_proposition').value.trim();
    
    if (window.logger) {
        window.logger.info('企業情報取得を開始', { company_url, value_proposition });
    }
    
    if (!company_url || !value_proposition) {
        if (window.logger) {
            window.logger.warning('企業情報取得: 必須項目が不足しています', { company_url, value_proposition });
        }
        alert('企業URLと価値提案は必須です');
        return;
    }
    
    // URL形式の簡易チェック
    try {
        new URL(company_url);
    } catch (e) {
        alert('有効なURLを入力してください');
        return;
    }
    
    showLoading('companyInfoResult');
    
    try {
        const response = await fetch(`${API_BASE_URL}/company/scrape/`, {
            method: 'POST',
            headers: {
                'Authorization': `Token ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: company_url,
                value_proposition: value_proposition
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentCompanyId = data.id;
            
            if (window.logger) {
                window.logger.info('企業情報取得成功', { companyId: currentCompanyId });
            }
            
            // 企業情報を表示
            displayCompanyInfo(data);
        } else {
            let errorMessage = '企業情報の取得に失敗しました: ';
            if (response.status === 401) {
                errorMessage = '認証エラーが発生しました。再度ログインしてください。';
                // トークンをクリア
                authToken = null;
                localStorage.removeItem('authToken');
                // ログイン画面に戻る
                setTimeout(() => {
                    alert('セッションが期限切れです。再度ログインしてください。');
                    document.getElementById('loginForm').style.display = 'block';
                    document.getElementById('userInfo').style.display = 'none';
                    showStep(0);
                }, 1000);
            } else if (data.detail) {
                errorMessage += data.detail;
            } else if (data.message) {
                errorMessage += data.message;
            } else if (data.error) {
                errorMessage += data.error;
            } else if (typeof data === 'object' && Object.keys(data).length > 0) {
                errorMessage += JSON.stringify(data);
            } else {
                errorMessage += '不明なエラー';
            }
            if (window.logger) {
                window.logger.error('企業情報取得エラー詳細', { status: response.status, data });
            }
            showError('companyInfoResult', errorMessage);
        }
    } catch (error) {
        let errorMsg = 'エラーが発生しました: ' + error.message;
        if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
            errorMsg = 'サーバーに接続できませんでした。\nバックエンドサーバー（http://localhost:8000）が起動しているか確認してください。';
        }
        if (window.logger) {
            window.logger.error('企業情報取得エラー', { message: error.message, stack: error.stack, errorType: error.name });
        }
        showError('companyInfoResult', errorMsg);
    }
}

// 企業情報を表示
function displayCompanyInfo(companyData) {
    const resultElement = document.getElementById('companyInfoResult');
    if (!resultElement) {
        if (window.logger) {
            window.logger.error('companyInfoResult要素が見つかりません');
        }
        return;
    }
    
    // ローディングをクリア
    const loadingElement = resultElement.querySelector('.loading');
    if (loadingElement) {
        loadingElement.remove();
    }
    
    const companyInfoHtml = `
        <h3>企業情報を取得しました</h3>
        <div class="company-info-display">
            <div class="company-info-item">
                <strong>企業名:</strong> ${escapeHtml(companyData.company_name || '未設定')}
            </div>
            ${companyData.industry ? `
            <div class="company-info-item">
                <strong>業界:</strong> ${escapeHtml(companyData.industry)}
            </div>
            ` : ''}
            ${companyData.business_description ? `
            <div class="company-info-item">
                <strong>事業内容:</strong> ${escapeHtml(companyData.business_description)}
            </div>
            ` : ''}
            ${companyData.location ? `
            <div class="company-info-item">
                <strong>所在地:</strong> ${escapeHtml(companyData.location)}
            </div>
            ` : ''}
            ${companyData.employee_count ? `
            <div class="company-info-item">
                <strong>従業員数:</strong> ${escapeHtml(companyData.employee_count)}
            </div>
            ` : ''}
            ${companyData.established_year ? `
            <div class="company-info-item">
                <strong>設立年:</strong> ${escapeHtml(String(companyData.established_year))}
            </div>
            ` : ''}
        </div>
        <button onclick="startDetailedDiagnosis()" class="btn-primary">診断開始</button>
    `;
    
    resultElement.innerHTML = companyInfoHtml;
    resultElement.style.display = 'block';
}

// 詳細診断開始（企業情報をセッションに紐付けてチャット開始）
async function startDetailedDiagnosis() {
    // トークンを最新の状態で取得
    authToken = localStorage.getItem('authToken');
    
    if (!authToken) {
        alert('ログインしてください');
        showStep(0); // ログイン画面に戻る
        return;
    }
    
    if (!currentCompanyId) {
        alert('企業情報が取得されていません');
        return;
    }
    
    const company_url = document.getElementById('company_url').value.trim();
    const value_proposition = document.getElementById('detailed_value_proposition').value.trim();
    const customer_persona = document.getElementById('detailed_customer_persona').value.trim();
    
    // 企業情報を取得
    let companyData = null;
    try {
        // スクレイピング済みの企業情報を取得（セッション作成時に使用）
        // ここではセッション作成時にcompany_idを指定するだけでOK
        companyData = { id: currentCompanyId };
    } catch (error) {
        if (window.logger) {
            window.logger.error('企業情報取得エラー', { error });
        }
        alert('企業情報の取得に失敗しました');
        return;
    }
    
    if (window.logger) {
        window.logger.info('詳細診断開始', { companyId: currentCompanyId, value_proposition, customer_persona });
    }
    
    // スクレイピング時に業界情報も取得できているはずなので、企業情報から業界を取得
    // セッション開始時にcompany_idを指定してセッションを作成
    // セッション開始APIを確認して、company_idを指定できるか確認する必要がある
    
    showLoading('companyInfoResult');
    
    try {
        // セッションを開始（企業情報を紐付け）
        const response = await fetch(`${API_BASE_URL}/session/start/`, {
            method: 'POST',
            headers: {
                'Authorization': `Token ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                mode: 'detailed',  // 明示的にmodeを指定
                // company_idがある場合は業界は不要（企業情報から取得される）
                // industry: '', // company_idがある場合は送らない
                value_proposition: value_proposition,
                customer_persona: customer_persona || undefined,
                customer_pain: null,
                company_id: currentCompanyId // 企業情報のID
            })
        });
        
        // 401エラーの場合は、JSON解析前にチェック
        if (response.status === 401) {
            // 認証エラー - トークンをクリアしてログイン画面に戻る
            authToken = null;
            localStorage.removeItem('authToken');
            localStorage.removeItem('username');
            
            if (window.logger) {
                window.logger.warning('認証エラー（401）: トークンが無効です。ログイン画面に戻ります。');
            }
            
            alert('ログインセッションが期限切れです。再度ログインしてください。');
            logout(); // ログアウト処理で画面をリセット
            return;
        }
        
        const data = await response.json();
        
        if (response.ok) {
            currentSessionId = data.id;
            
            if (window.logger) {
                window.logger.info('詳細診断セッション開始成功、チャット画面へ遷移', { sessionId: currentSessionId, companyId: currentCompanyId });
            }
            
            // チャット画面に企業情報を保存（表示用）
            currentCompanyInfo = companyData;
            
            // 直接チャット画面へ遷移
            showStep(3);
            loadChatHistory();
        } else {
            // エラーレスポンスの詳細を表示
            let errorMessage = 'セッション開始に失敗しました: ';
            if (data.industry) {
                errorMessage += data.industry[0] || '';
            } else if (data.value_proposition) {
                errorMessage += data.value_proposition[0] || '';
            } else if (data.company_id) {
                errorMessage += data.company_id[0] || '';
            } else if (typeof data === 'object' && Object.keys(data).length > 0) {
                errorMessage += JSON.stringify(data);
            } else {
                errorMessage += data.message || data.error || '不明なエラー';
            }
            if (window.logger) {
                window.logger.error('セッション開始エラー詳細', { status: response.status, data });
            }
            showError('companyInfoResult', errorMessage);
        }
    } catch (error) {
        let errorMsg = 'エラーが発生しました: ' + error.message;
        if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
            errorMsg = 'サーバーに接続できませんでした。\nバックエンドサーバー（http://localhost:8000）が起動しているか確認してください。';
        }
        if (window.logger) {
            window.logger.error('詳細診断開始エラー', { mode: currentMode, message: error.message, stack: error.stack, errorType: error.name });
        }
        showError('companyInfoResult', errorMsg);
    }
}

// ステップ1: SPIN質問生成（使用されませんが、互換性のために残しています）
async function generateSpinQuestions() {
    // SPIN質問生成は認証不要
    
    const industry = document.getElementById('industry').value;
    const value_proposition = document.getElementById('value_proposition').value;
    const customer_persona = document.getElementById('customer_persona').value;
    const customer_pain = document.getElementById('customer_pain').value;
    
    if (window.logger) {
        window.logger.info('SPIN質問生成を開始', { industry, value_proposition, customer_persona, customer_pain });
    }
    
    if (!industry || !value_proposition) {
        if (window.logger) {
            window.logger.warning('SPIN質問生成: 必須項目が不足しています', { industry, value_proposition });
        }
        alert('業界と価値提案は必須です');
        return;
    }
    
    showLoading('spinQuestionsResult');
    
    const requestData = {
        industry,
        value_proposition,
        customer_persona: customer_persona || undefined,
        customer_pain: customer_pain || undefined
    };
    
    if (window.logger) {
        window.logger.apiRequest('POST', `${API_BASE_URL}/spin/generate/`, requestData);
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/spin/generate/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        let data;
        let responseText;
        try {
            responseText = await response.text();
            if (window.logger) {
                window.logger.debug('レスポンステキストを取得', { 
                    length: responseText.length,
                    text: responseText.substring(0, 500) 
                });
            }
            
            try {
                data = JSON.parse(responseText);
                if (window.logger) {
                    window.logger.debug('JSON解析成功', { 
                        hasQuestions: !!data.questions,
                        dataKeys: Object.keys(data)
                    });
                }
            } catch (parseError) {
                if (window.logger) {
                    window.logger.error('JSON解析エラー', { 
                        text: responseText, 
                        error: parseError.message,
                        errorStack: parseError.stack
                    });
                }
                throw new Error('レスポンスのJSON解析に失敗しました: ' + parseError.message);
            }
        } catch (jsonError) {
            if (window.logger) {
                window.logger.error('レスポンス取得エラー', { error: jsonError.message, stack: jsonError.stack });
            }
            showError('spinQuestionsResult', 'レスポンスの処理に失敗しました: ' + jsonError.message);
            return;
        }
        
        if (window.logger) {
            window.logger.apiResponse('POST', `${API_BASE_URL}/spin/generate/`, response.status, data);
        }
        
        if (response.ok) {
            if (window.logger) {
                window.logger.debug('レスポンスデータの内容', { data, hasQuestions: !!data.questions });
            }
            
            if (data.questions) {
                if (window.logger) {
                    window.logger.info('質問データを検出、表示処理を開始', { 
                        questionKeys: Object.keys(data.questions),
                        questionCount: Object.keys(data.questions).length 
                    });
                }
                
                // まず親要素を表示してから、子要素にアクセス
                const resultElement = document.getElementById('spinQuestionsResult');
                if (resultElement) {
                    // ローディングをクリア
                    const loadingElement = resultElement.querySelector('.loading');
                    if (loadingElement) {
                        loadingElement.remove();
                    }
                    
                    // 親要素を表示
                    resultElement.style.display = 'block';
                    
                    // すぐに表示処理を実行（要素は既に存在している）
                    displaySpinQuestions(data.questions);
                    
                    // コンテンツが表示されているか確認
                    const contentElement = document.getElementById('spinQuestionsContent');
                    if (!contentElement || contentElement.innerHTML.trim() === '') {
                        if (window.logger) {
                            window.logger.warning('コンテンツ要素が空です。再試行します。', { 
                                questions: data.questions,
                                contentElement: !!contentElement,
                                parentHTML: resultElement.innerHTML.substring(0, 300)
                            });
                        }
                        // 少し待ってからもう一度表示を試みる
                        setTimeout(() => {
                            displaySpinQuestions(data.questions);
                        }, 100);
                    } else {
                        if (window.logger) {
                            window.logger.info('コンテンツが正常に表示されました', { 
                                contentLength: contentElement.innerHTML.length 
                            });
                        }
                    }
                } else {
                    if (window.logger) {
                        window.logger.error('spinQuestionsResult要素が見つかりません');
                    }
                    // 要素が見つからない場合でも、とにかく表示を試みる
                    displaySpinQuestions(data.questions);
                }
                
                if (window.logger) {
                    window.logger.info('SPIN質問生成が完了しました', { questionCount: Object.keys(data.questions).length });
                }
            } else {
                if (window.logger) {
                    window.logger.error('質問データが存在しません', { 
                        data,
                        dataKeys: data ? Object.keys(data) : [],
                        responseText: responseText ? responseText.substring(0, 500) : 'N/A'
                    });
                }
                showError('spinQuestionsResult', '質問データの形式が正しくありません。レスポンス: ' + JSON.stringify(data));
            }
        } else {
            if (window.logger) {
                window.logger.error('SPIN質問生成に失敗しました', { status: response.status, data });
            }
            showError('spinQuestionsResult', '質問生成に失敗しました: ' + (data.message || data.error || '不明なエラー'));
        }
    } catch (error) {
        if (window.logger) {
            window.logger.error('SPIN質問生成エラー', { message: error.message, stack: error.stack, errorType: error.name });
        }
        
        // Failed to fetchエラーの場合、サーバー接続の問題である可能性が高い
        let errorMsg = 'エラー: ' + error.message;
        if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
            errorMsg = 'サーバーに接続できませんでした。\nバックエンドサーバー（http://localhost:8000）が起動しているか確認してください。';
        }
        showError('spinQuestionsResult', errorMsg);
    }
}

// SPIN質問の表示
function displaySpinQuestions(questions) {
    if (window.logger) {
        window.logger.debug('displaySpinQuestions called with:', questions);
        window.logger.debug('質問データの構造', {
            hasQuestions: !!questions,
            isObject: typeof questions === 'object',
            keys: questions ? Object.keys(questions) : [],
            questionTypes: questions ? Object.keys(questions).map(key => ({
                key,
                isArray: Array.isArray(questions[key]),
                length: Array.isArray(questions[key]) ? questions[key].length : 0
            })) : []
        });
    }
    
    // 親要素を取得
    const parentElement = document.getElementById('spinQuestionsResult');
    if (!parentElement) {
        const errorMsg = 'spinQuestionsResult要素が見つかりません';
        if (window.logger) {
            window.logger.error(errorMsg);
        }
        console.error(errorMsg);
        alert('エラー: spinQuestionsResult要素が見つかりません。ページをリロードしてください。');
        return;
    }
    
    // 親要素を表示（非表示の場合）
    if (parentElement.style.display === 'none' || !parentElement.offsetParent) {
        if (window.logger) {
            window.logger.debug('親要素が非表示のため、表示します');
        }
        parentElement.style.display = 'block';
    }
    
    // 要素を探す（まず親要素内を検索、次に全体検索）
    let container = parentElement.querySelector('[id="spinQuestionsContent"]');
    
    // 見つからない場合は、全体検索
    if (!container) {
        container = document.getElementById('spinQuestionsContent');
    }
    
    // それでも見つからない場合は、親要素の子要素を直接検索
    if (!container && parentElement.children) {
        for (let i = 0; i < parentElement.children.length; i++) {
            const child = parentElement.children[i];
            if (child.id === 'spinQuestionsContent') {
                container = child;
                break;
            }
            // 孫要素も検索
            const grandChild = child.querySelector('[id="spinQuestionsContent"]');
            if (grandChild) {
                container = grandChild;
                break;
            }
        }
    }
    
    if (!container) {
        const errorMsg = 'spinQuestionsContent要素が見つかりません';
        if (window.logger) {
            window.logger.error(errorMsg, { 
                containerExists: !!document.getElementById('spinQuestionsContent'),
                parentExists: !!parentElement,
                parentDisplay: parentElement.style.display,
                parentInnerHTML: parentElement.innerHTML.length,
                parentChildren: Array.from(parentElement.children).map(el => ({
                    tag: el.tagName,
                    id: el.id,
                    className: el.className
                }))
            });
        }
        console.error(errorMsg);
        alert('エラー: spinQuestionsContent要素が見つかりません。ページをリロードしてください。');
        return;
    }
    
    if (!questions) {
        const errorMsg = '質問データがnullまたはundefinedです';
        if (window.logger) {
            window.logger.error(errorMsg);
        }
        container.innerHTML = '<p class="error-message">質問データが見つかりませんでした</p>';
        return;
    }
    
    if (typeof questions !== 'object') {
        const errorMsg = '質問データがオブジェクトではありません: ' + typeof questions;
        if (window.logger) {
            window.logger.error(errorMsg, { questions });
        }
        container.innerHTML = '<p class="error-message">質問データの形式が正しくありません</p>';
        return;
    }
    
    container.innerHTML = '';
    
    const categories = [
        { key: 'situation', label: 'Situation（状況確認）' },
        { key: 'problem', label: 'Problem（問題発見）' },
        { key: 'implication', label: 'Implication（示唆）' },
        { key: 'need', label: 'Need（ニーズ確認）' }
    ];
    
    let hasQuestions = false;
    const addedCategories = [];
    
    categories.forEach(cat => {
        if (window.logger) {
            window.logger.debug(`カテゴリ ${cat.key} をチェック`, {
                exists: questions.hasOwnProperty(cat.key),
                value: questions[cat.key],
                isArray: Array.isArray(questions[cat.key]),
                length: Array.isArray(questions[cat.key]) ? questions[cat.key].length : 'N/A'
            });
        }
        
        if (questions[cat.key] && Array.isArray(questions[cat.key]) && questions[cat.key].length > 0) {
            hasQuestions = true;
            addedCategories.push(cat.key);
            
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'spin-category';
            
            const questionsList = questions[cat.key].map(q => {
                if (typeof q !== 'string') {
                    if (window.logger) {
                        window.logger.warning(`質問が文字列ではありません: ${cat.key}`, { question: q, type: typeof q });
                    }
                    return `<li>${escapeHtml(String(q))}</li>`;
                }
                return `<li>${escapeHtml(q)}</li>`;
            }).join('');
            
            categoryDiv.innerHTML = `
                <h4>${cat.label}</h4>
                <ul>
                    ${questionsList}
                </ul>
            `;
            container.appendChild(categoryDiv);
            
            if (window.logger) {
                window.logger.debug(`カテゴリ ${cat.key} を追加`, { questionCount: questions[cat.key].length });
            }
        } else {
            if (window.logger) {
                window.logger.debug(`カテゴリ ${cat.key} はスキップ`, {
                    hasValue: !!questions[cat.key],
                    isArray: Array.isArray(questions[cat.key]),
                    length: Array.isArray(questions[cat.key]) ? questions[cat.key].length : 'N/A'
                });
            }
        }
    });
    
    if (!hasQuestions) {
        const warningMsg = '表示可能な質問がありません。データ構造: ' + JSON.stringify(questions);
        if (window.logger) {
            window.logger.warning(warningMsg, { 
                allKeys: Object.keys(questions),
                questionTypes: Object.keys(questions).map(key => ({
                    key,
                    type: typeof questions[key],
                    isArray: Array.isArray(questions[key]),
                    value: Array.isArray(questions[key]) ? questions[key] : questions[key]
                }))
            });
        }
        container.innerHTML = '<p class="error-message">質問データが見つかりませんでした<br><pre>' + escapeHtml(JSON.stringify(questions, null, 2)) + '</pre></p>';
    } else {
        if (window.logger) {
            window.logger.info('SPIN質問の表示が完了しました', { 
                addedCategories,
                totalCategories: addedCategories.length
            });
        }
    }
}

// HTMLエスケープ関数を追加
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// セッション開始に進む
function proceedToSessionStart() {
    // フォームデータをセッション開始フォームにコピー
    document.getElementById('session_industry').value = document.getElementById('industry').value;
    document.getElementById('session_value_proposition').value = document.getElementById('value_proposition').value;
    document.getElementById('session_customer_persona').value = document.getElementById('customer_persona').value;
    document.getElementById('session_customer_pain').value = document.getElementById('customer_pain').value;
    
    showStep(2);
}

// ステップ2: セッション開始
async function startSession() {
    if (!authToken) {
        alert('ログインしてください');
        return;
    }
    
    const industry = document.getElementById('session_industry').value;
    const value_proposition = document.getElementById('session_value_proposition').value;
    const customer_persona = document.getElementById('session_customer_persona').value;
    const customer_pain = document.getElementById('session_customer_pain').value;
    
    showLoading('sessionStartResult');
    
    try {
        const response = await fetch(`${API_BASE_URL}/session/start/`, {
            method: 'POST',
            headers: {
                'Authorization': `Token ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                industry,
                value_proposition,
                customer_persona: customer_persona || undefined,
                customer_pain: customer_pain || undefined
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentSessionId = data.id;
            document.getElementById('sessionIdDisplay').textContent = currentSessionId;
            document.getElementById('sessionStartResult').style.display = 'block';
        } else {
            showError('sessionStartResult', 'セッション開始に失敗しました: ' + (data.message || data.error));
        }
    } catch (error) {
        showError('sessionStartResult', 'エラー: ' + error.message);
    }
}

// チャットに進む
function proceedToChat() {
    showStep(3);
    loadChatHistory();
}

// ステップ3: チャット
async function sendChatMessage() {
    if (!authToken || !currentSessionId) {
        alert('セッションを開始してください');
        return;
    }
    
    const messageInput = document.getElementById('chatMessageInput');
    const message = messageInput.value.trim();
    
    if (!message) {
        alert('メッセージを入力してください');
        return;
    }
    
    // 送信中のメッセージを表示
    addChatMessage('salesperson', message);
    messageInput.value = '';
    
    showChatLoading();
    
    try {
        const response = await fetch(`${API_BASE_URL}/session/chat/`, {
            method: 'POST',
            headers: {
                'Authorization': `Token ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: currentSessionId,
                message: message
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // 会話履歴を更新
            updateChatMessages(data.conversation);
            
            // 詳細診断モードの場合、成功率情報を更新
            if (currentMode === 'detailed' && data.success_probability !== undefined) {
                updateSuccessProbability(data.success_probability, data.success_delta, data.analysis_reason);
                
                // ログに記録
                if (window.logger) {
                    window.logger.info('成功率更新', {
                        success_probability: data.success_probability,
                        success_delta: data.success_delta,
                        analysis_reason: data.analysis_reason
                    });
                }
            }
        } else {
            showChatError('メッセージ送信に失敗しました: ' + (data.message || data.error));
        }
    } catch (error) {
        showChatError('エラー: ' + error.message);
    }
}

// Enterキーで送信
function handleChatKeyPress(event) {
    if (event.key === 'Enter') {
        sendChatMessage();
    }
}

// チャットメッセージの追加
function addChatMessage(role, message) {
    const container = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const roleLabel = role === 'salesperson' ? '営業担当者' : 'AI顧客';
    const timestamp = new Date().toLocaleTimeString('ja-JP');
    
    messageDiv.innerHTML = `
        <div class="message-header">${roleLabel} - ${timestamp}</div>
        <div class="message-content">${message}</div>
    `;
    
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
}

// チャット履歴の更新
function updateChatMessages(conversation) {
    const container = document.getElementById('chatMessages');
    if (!container) {
        console.error('chatMessages要素が見つかりません');
        return;
    }
    
    container.innerHTML = '';
    
    conversation.forEach(msg => {
        addChatMessage(msg.role, msg.message);
    });
}

// チャット履歴の読み込み
async function loadChatHistory() {
    if (!currentSessionId) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/session/${currentSessionId}/`, {
            method: 'GET',
            headers: {
                'Authorization': `Token ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // 企業情報がある場合は表示（詳細診断モード）
            if (data.company) {
                displayCompanySummary(data.company);
            }
            
            // 詳細診断モードの場合、成功率パネルを表示
            if (currentMode === 'detailed') {
                showSuccessMeter();
                // 初期成功率を表示（セッションの成功率）
                const initialProbability = data.success_probability !== undefined ? data.success_probability : 50;
                updateSuccessProbability(initialProbability, 0, null);
            } else {
                // 簡易診断モードの場合は非表示
                hideSuccessMeter();
            }
            
            // メッセージがある場合は表示
            if (data.messages) {
                updateChatMessages(data.messages);
            }
        }
    } catch (error) {
        console.error('チャット履歴の読み込みに失敗:', error);
        if (window.logger) {
            window.logger.error('チャット履歴読み込みエラー', { error });
        }
    }
}

// 企業概要をチャット画面の上部に表示
function displayCompanySummary(companyData) {
    const chatContainer = document.querySelector('.chat-container');
    if (!chatContainer) {
        if (window.logger) {
            window.logger.warning('chat-container要素が見つかりません');
        }
        return;
    }
    
    // 既存の企業概要表示を削除
    const existingSummary = document.getElementById('companySummary');
    if (existingSummary) {
        existingSummary.remove();
    }
    
    // 企業概要表示エリアを作成
    const summaryDiv = document.createElement('div');
    summaryDiv.id = 'companySummary';
    summaryDiv.className = 'company-summary';
    
    const summaryHTML = `
        <div class="company-summary-header">
            <h3>📋 企業概要</h3>
        </div>
        <div class="company-summary-content">
            <div class="company-summary-item">
                <strong>企業名:</strong> ${escapeHtml(companyData.company_name || '未設定')}
            </div>
            ${companyData.industry ? `
            <div class="company-summary-item">
                <strong>業界:</strong> ${escapeHtml(companyData.industry)}
            </div>
            ` : ''}
            ${companyData.business_description ? `
            <div class="company-summary-item">
                <strong>事業内容:</strong> ${escapeHtml(companyData.business_description)}
            </div>
            ` : ''}
            ${companyData.location ? `
            <div class="company-summary-item">
                <strong>所在地:</strong> ${escapeHtml(companyData.location)}
            </div>
            ` : ''}
            ${companyData.employee_count ? `
            <div class="company-summary-item">
                <strong>従業員数:</strong> ${escapeHtml(companyData.employee_count)}
            </div>
            ` : ''}
            ${companyData.established_year ? `
            <div class="company-summary-item">
                <strong>設立年:</strong> ${escapeHtml(String(companyData.established_year))}
            </div>
            ` : ''}
        </div>
    `;
    
    summaryDiv.innerHTML = summaryHTML;
    
    // チャットコンテナの最初に挿入（chatMessagesの前）
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages && chatMessages.parentNode) {
        chatMessages.parentNode.insertBefore(summaryDiv, chatMessages);
    } else {
        // chatMessagesが見つからない場合は、chat-containerの最初に挿入
        chatContainer.insertBefore(summaryDiv, chatContainer.firstChild);
    }
}

// 成功率パネルを表示
function showSuccessMeter() {
    const successMeter = document.getElementById('successMeter');
    if (successMeter) {
        successMeter.style.display = 'block';
    }
}

// 成功率パネルを非表示
function hideSuccessMeter() {
    const successMeter = document.getElementById('successMeter');
    if (successMeter) {
        successMeter.style.display = 'none';
    }
}

// 成功率を更新
function updateSuccessProbability(probability, delta, reason) {
    const probabilityValue = document.getElementById('successProbabilityValue');
    const deltaDisplay = document.getElementById('successDeltaDisplay');
    const deltaValue = document.getElementById('successDeltaValue');
    const reasonDisplay = document.getElementById('successReasonDisplay');
    const reasonText = document.getElementById('successReasonText');
    
    if (probabilityValue) {
        // アニメーションを追加
        probabilityValue.classList.add('updating');
        setTimeout(() => {
            probabilityValue.textContent = probability;
            probabilityValue.classList.remove('updating');
        }, 100);
    }
    
    // 変動量を表示
    if (deltaDisplay && deltaValue && delta !== 0) {
        deltaDisplay.style.display = 'flex';
        deltaValue.textContent = (delta > 0 ? '+' : '') + delta;
        deltaValue.className = 'success-delta-value ' + (delta > 0 ? 'positive' : 'negative');
        
        // 3秒後に非表示
        setTimeout(() => {
            deltaDisplay.style.display = 'none';
        }, 3000);
    } else if (deltaDisplay && delta === 0) {
        deltaDisplay.style.display = 'none';
    }
    
    // 変動理由を表示
    if (reasonDisplay && reasonText && reason) {
        reasonDisplay.style.display = 'block';
        reasonText.textContent = reason;
    } else if (reasonDisplay && !reason) {
        reasonDisplay.style.display = 'none';
    }
}

// ステップ4: セッション終了・スコアリング
async function finishSession() {
    if (!authToken || !currentSessionId) {
        alert('セッションを開始してください');
        return;
    }
    
    if (!confirm('セッションを終了してスコアリングを実行しますか？')) {
        return;
    }
    
    showLoading('scoringResult');
    showStep(4);
    
    try {
        const response = await fetch(`${API_BASE_URL}/session/finish/`, {
            method: 'POST',
            headers: {
                'Authorization': `Token ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: currentSessionId
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentReportId = data.report_id;
            displayScoringResult(data);
        } else {
            showError('scoringResult', 'スコアリングに失敗しました: ' + (data.message || data.error));
        }
    } catch (error) {
        showError('scoringResult', 'エラー: ' + error.message);
    }
}

// スコアリング結果の表示
function displayScoringResult(data) {
    const container = document.getElementById('scoringResult');
    if (!container) {
        console.error('scoringResult要素が見つかりません');
        return;
    }
    
    const scores = data.spin_scores;
    const totalScore = scores.total;
    
    // スコアに応じた色を決定
    let scoreColor = '#667eea';
    if (totalScore >= 80) scoreColor = '#28a745';
    else if (totalScore >= 60) scoreColor = '#ffc107';
    else scoreColor = '#dc3545';
    
    container.innerHTML = `
        <div class="score-card">
            <div class="score-total" style="color: ${scoreColor}">${totalScore.toFixed(1)}点</div>
            <div class="score-details">
                <div class="score-item">
                    <div class="score-item-label">Situation</div>
                    <div class="score-item-value">${scores.situation}点</div>
                </div>
                <div class="score-item">
                    <div class="score-item-label">Problem</div>
                    <div class="score-item-value">${scores.problem}点</div>
                </div>
                <div class="score-item">
                    <div class="score-item-label">Implication</div>
                    <div class="score-item-value">${scores.implication}点</div>
                </div>
                <div class="score-item">
                    <div class="score-item-label">Need</div>
                    <div class="score-item-value">${scores.need}点</div>
                </div>
            </div>
        </div>
        <div class="feedback-section">
            <h3>フィードバック</h3>
            <div class="feedback-text">${data.feedback}</div>
        </div>
        <div class="feedback-section">
            <h3>次回アクション</h3>
            <div class="feedback-text">${data.next_actions}</div>
        </div>
    `;
}

// ステップ5: レポート詳細表示
async function viewReport() {
    if (!currentReportId) {
        alert('レポートIDが設定されていません');
        return;
    }
    
    showStep(5);
    showLoading('reportDetails');
    
    try {
        const response = await fetch(`${API_BASE_URL}/report/${currentReportId}/`, {
            method: 'GET',
            headers: {
                'Authorization': `Token ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            displayReportDetails(data);
        } else {
            showError('reportDetails', 'レポート取得に失敗しました: ' + (data.message || data.error));
        }
    } catch (error) {
        showError('reportDetails', 'エラー: ' + error.message);
    }
}

// レポート詳細の表示
function displayReportDetails(report) {
    const container = document.getElementById('reportDetails');
    if (!container) {
        console.error('reportDetails要素が見つかりません');
        return;
    }
    
    const scores = report.spin_scores;
    
    let detailsHTML = `
        <div class="score-card">
            <h3>スコア概要</h3>
            <div class="score-total">${scores.total.toFixed(1)}点</div>
            <div class="score-details">
                <div class="score-item">
                    <div class="score-item-label">Situation</div>
                    <div class="score-item-value">${scores.situation}点</div>
                </div>
                <div class="score-item">
                    <div class="score-item-label">Problem</div>
                    <div class="score-item-value">${scores.problem}点</div>
                </div>
                <div class="score-item">
                    <div class="score-item-label">Implication</div>
                    <div class="score-item-value">${scores.implication}点</div>
                </div>
                <div class="score-item">
                    <div class="score-item-label">Need</div>
                    <div class="score-item-value">${scores.need}点</div>
                </div>
            </div>
        </div>
        <div class="feedback-section">
            <h3>フィードバック</h3>
            <div class="feedback-text">${report.feedback}</div>
        </div>
        <div class="feedback-section">
            <h3>次回アクション</h3>
            <div class="feedback-text">${report.next_actions}</div>
        </div>
    `;
    
    if (report.scoring_details) {
        detailsHTML += '<div class="feedback-section"><h3>詳細スコア</h3>';
        
        Object.keys(report.scoring_details).forEach(key => {
            const detail = report.scoring_details[key];
            const labels = {
                'situation': 'Situation（状況確認）',
                'problem': 'Problem（問題発見）',
                'implication': 'Implication（示唆）',
                'need': 'Need（ニーズ確認）'
            };
            
            detailsHTML += `
                <div style="margin-bottom: 20px; padding: 15px; background: white; border-radius: 6px;">
                    <h4>${labels[key] || key} - ${detail.score}点</h4>
                    <p><strong>コメント:</strong> ${detail.comments}</p>
                    ${detail.strengths && detail.strengths.length > 0 ? `
                        <p><strong>強み:</strong></p>
                        <ul>
                            ${detail.strengths.map(s => `<li>${s}</li>`).join('')}
                        </ul>
                    ` : ''}
                    ${detail.weaknesses && detail.weaknesses.length > 0 ? `
                        <p><strong>改善点:</strong></p>
                        <ul>
                            ${detail.weaknesses.map(w => `<li>${w}</li>`).join('')}
                        </ul>
                    ` : ''}
                </div>
            `;
        });
        
        detailsHTML += '</div>';
    }
    
    container.innerHTML = detailsHTML;
}

// セッション一覧の表示
async function viewSessionList() {
    if (!authToken) {
        alert('ログインしてください');
        return;
    }
    
    showStep('sessionList');
    showLoading('sessionListContent');
    
    try {
        const response = await fetch(`${API_BASE_URL}/session/list/`, {
            method: 'GET',
            headers: {
                'Authorization': `Token ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            displaySessionList(data.results);
        } else {
            showError('sessionListContent', 'セッション一覧取得に失敗しました: ' + (data.message || data.error));
        }
    } catch (error) {
        showError('sessionListContent', 'エラー: ' + error.message);
    }
}

// セッション一覧の表示
function displaySessionList(sessions) {
    const container = document.getElementById('sessionListContent');
    
    if (!container) {
        console.error('sessionListContent要素が見つかりません');
        return;
    }
    
    if (sessions.length === 0) {
        container.innerHTML = '<p>セッションがありません</p>';
        return;
    }
    
    container.innerHTML = sessions.map(session => `
        <div class="session-item" onclick="viewSessionDetail('${session.id}')">
            <div class="session-item-header">
                <span class="session-item-id">${session.id}</span>
                <span class="session-item-status ${session.status}">${session.status === 'active' ? '進行中' : '完了'}</span>
            </div>
            <div class="session-item-info">
                <div><strong>業界:</strong> ${session.industry}</div>
                <div><strong>価値提案:</strong> ${session.value_proposition}</div>
                <div><strong>開始日時:</strong> ${new Date(session.started_at).toLocaleString('ja-JP')}</div>
                ${session.finished_at ? `<div><strong>終了日時:</strong> ${new Date(session.finished_at).toLocaleString('ja-JP')}</div>` : ''}
            </div>
        </div>
    `).join('');
}

// セッション一覧の更新
function refreshSessionList() {
    viewSessionList();
}

// セッション詳細の表示
async function viewSessionDetail(sessionId) {
    currentSessionId = sessionId;
    showStep(3);
    await loadChatHistory();
}

// 新しいセッションを開始
function startNewSession() {
    currentSessionId = null;
    currentReportId = null;
    resetToStep1();
}

// ステップ1にリセット
function resetToStep1() {
    // モードが選択されていない場合は、モード選択画面に戻る
    if (!currentMode) {
        showStep(0);
        return;
    }
    
    // モードが選択されている場合は、そのモードの最初のステップに戻る
    if (currentMode === 'simple') {
        showStep('step1-simple');
    } else if (currentMode === 'detailed') {
        // 詳細診断モードの最初のステップ（企業情報取得）
        showStep('step1-detailed');
    }
    
    const spinResult = document.getElementById('spinQuestionsResult');
    if (spinResult) spinResult.style.display = 'none';
    
    const sessionResult = document.getElementById('sessionStartResult');
    if (sessionResult) sessionResult.style.display = 'none';
    
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) chatMessages.innerHTML = '';
    
    const chatInput = document.getElementById('chatMessageInput');
    if (chatInput) chatInput.value = '';
}

// ステップの表示切り替え
function showStep(stepNumber) {
    // すべてのステップを非表示
    const sections = document.querySelectorAll('.step-section');
    if (sections && sections.length > 0) {
        sections.forEach(section => {
            section.classList.remove('active');
            section.style.display = 'none';
        });
    }
    
    // 指定されたステップを表示
    const stepId = typeof stepNumber === 'string' ? stepNumber : `step${stepNumber}`;
    const stepElement = document.getElementById(stepId);
    if (stepElement) {
        stepElement.classList.add('active');
        stepElement.style.display = 'block';
    } else {
        console.warn(`ステップ要素が見つかりません: ${stepId}`);
    }
}

// ローディング表示
function showLoading(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        // 既存のローディング要素を削除
        const existingLoading = element.querySelector('.loading');
        if (existingLoading) {
            existingLoading.remove();
        }
        
        // ローディング要素を追加（既存の内容は保持）
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading';
        loadingDiv.innerHTML = '<div class="spinner"></div><p>読み込み中...</p>';
        
        // 要素の先頭に挿入（既存の内容の前）
        element.insertBefore(loadingDiv, element.firstChild);
        element.style.display = 'block';
    } else {
        console.warn(`ローディング要素が見つかりません: ${elementId}`);
    }
}

// エラー表示
function showError(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = message;
        element.style.display = 'block';
    }
}

// 成功メッセージ表示
function showSuccess(message) {
    alert(message);
}

// チャットローディング表示
function showChatLoading() {
    // 実装済み（送信中の表示）
}

// チャットエラー表示
function showChatError(message) {
    addChatMessage('customer', `[エラー] ${message}`);
}

