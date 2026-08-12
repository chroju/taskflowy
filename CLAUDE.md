# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TaskflowyはWorkflowy公式APIを利用したタスク管理＋メモ書き留めPWA。Cloudflare Workers上で
動作し、フロントエンドにHono JSXを使用。もとはJotflowy（ノートアプリ）のタスクビュー機能を
分離・再構成したプロジェクトで、その後Jotflowyのメモ書き留め機能を「ビュー統合」として
本アプリに吸収した。設計上の経緯は[DESIGN.md](./DESIGN.md)を参照。

## Commands

```bash
npm run dev        # 開発サーバー起動 (wrangler dev)
npm run deploy     # Cloudflare Workersへデプロイ
npm run typecheck  # TypeScript型チェック
npm test           # vitestでテスト実行（watchモード）
npm run test:run   # テストを1回実行
npm run test:ui    # vitest UI起動
```

## Git Workflow

- コミットメッセージとPR（タイトル・本文）は英語で書く

## Testing Policy

- 新機能・バグ修正は必ずテストを先に書く（TDD）
- テストファイルは `src/test/` に配置し、対象モジュール名に合わせて命名（例: `crypto.test.ts`）
- 既存テストパターン（`describe` / `it` / `expect`、vitest）に倣う
- 外部依存（`fetch`、Web Crypto API、`WorkflowyClient`）は `vi.stubGlobal` / `vi.fn()` でモックする
- テスト実行: `npm run test:run`

## Architecture

### Backend (src/)
- `index.tsx` - Honoアプリケーションのエントリーポイント。ルーティング定義、`scheduled`ハンドラ（Cron）
- `api/handlers.ts` - APIエンドポイント実装。認証、タスク操作、送信先ノード一覧、Push購読/通知設定など
- `api/workflowy-v1.ts` - Workflowy API v1クライアント
- `api/crypto.ts` - APIキーの暗号化/復号化
- `api/tasks.ts` - `nodes-export`のフラットなノード配列からタスク（layoutMode=todo）を抽出。
  デフォルトは未完了のみ、`includeCompleted`オプションで完了済みも含める（`/api/tasks`が使用）。
  `mergeRecurCompletions`は繰り返しタスクの完了記録を仮想の完了タスクとして合流させる
- `api/recur.ts` - 繰り返しルールの純粋ロジック。`parseRecurRule`（APIバリデーション）と
  `nextOccurrence`（指定日より後の直近の該当日。文字列/UTC演算でTZ非依存）
- `api/daily.ts` - Dailyビュー用。ネイティブカレンダーの日付キー（`YYYY-MM-DD`、404=その日なし）を
  遡ってプローブし、日付グループを収集する（`/api/daily`が使用）。`toViewItem`は
  Daily/登録ノードビュー共通のアイテム変換
- `api/time-markup.ts` - ノード名に埋め込む`<time>`マークアップのパース/生成。
  `replaceNameText`はマークアップを残したまま本文だけ差し替える（リネーム用）
- `api/jst.ts` - JST（UTC+9固定）の日付/時刻ユーティリティ。Dateのロケール依存メソッドは使わない
- `api/notify.ts` - `selectDueNotifications`: 通知対象タスクを判定する純粋関数
- `api/push.ts` - Web Push送信（`@block65/webcrypto-web-push`）とVAPID鍵ペア生成
- `api/kv-store.ts` - KVアクセスの薄いラッパー（購読リスト、通知済み記録、通知設定、暗号化APIキー、
  繰り返しルール、繰り返し完了記録）
- `api/cron.ts` - `runNotificationSweep`: Cronから呼ばれる通知送信フローの本体
- `types/index.ts` - 共有型定義

### Frontend (public/)
- `scripts/client.js` - UIロジック（DOM操作、イベントバインド）。LocalStorageで設定保存、APIとの通信
- `scripts/tasks.js` - タスク一覧の純粋ロジック（Today/Deadlines/Nodesのグルーピング・タイトル正規化・
  日付フォーマット・スワイプ判定など）。DOM非依存でユニットテスト可能（`src/test/task-view.test.ts`）
- `scripts/views.js` - ビュー統合の純粋ロジック（場所リストの移行・並べ替え・表示切り替え、
  ビューバーのスワイプ判定、Daily表示ヘルパー、composeの送信先解決・ノート分割、
  詳細シートの種別切り替えラベル）。テストは`src/test/views.test.ts`
- `scripts/utils.js` - `escapeHtml` / `stripHtml`のみ（Jotflowy由来の自由記述編集系ヘルパーは不要なため削除済み）
- `scripts/richtext.js` - リッチテキストのサニタイズ/描画（Issue #13）。ホワイトリスト方式で
  Workflowyのインライン装飾を安全なHTML文字列にする純粋ロジック（DOM利用、jsdomでテスト可能。
  `src/test/richtext.test.ts`）
- `styles/main.css` - スタイル（Charcoalテーマ=無彩色+期限切れ`#E39098`のみ。トークンは
  `design_handoff_taskflowy_views`のハンドオフ資料が正。基礎寸法は`design_handoff_workflowy_tasks`。
  フォントは日本語を含む全UIテキストがZen Kaku Gothic New。数値・時刻・日付だけ桁を
  揃えるため`ui-monospace`。読み込むウェイトは400/500/700で、600は実ファイルが無く
  指定しても500で描画されるため、sansのウェイト指定はこの3つに揃える
  （monoの600はシステムフォントなので有効））

### Server Components (src/components/)
- `layouts/BaseLayout.tsx` - HTMLベーステンプレート（PWA設定、Google Fonts読み込み含む）
- `pages/MainPage.tsx` - メインUIのJSX（サーバーサイドレンダリング）。下部ビューバー、
  Tasksビュー（Today/Deadlines/Nodesの3タブ）、詳細シート・composeシート・全画面設定の骨格を持つ

## Key Concepts

- **認証**: APIキーはHTTP-only Cookieに暗号化して保存（Jotflowyと同方式。saltはアプリ固有）
- **ビュー**: 下部ビューバーで Tasks（組み込み）/ Daily（組み込み）/ Search（組み込み）/
  登録ノード（0個以上）を切り替える。切り替え操作はバー上のスワイプ（±44pxで隣へ1つ）とタップのみで、本文領域の
  スワイプは行操作に予約。ビューの実体は「場所」リスト（後述）
- **場所（Place）**: ビュー兼書き込み先。`{id, kind: 'builtin'|'daily'|'node', name, ref, inView}`を
  LocalStorageに保存（`views.js`の`migratePlaces`が旧destinations設定から自動移行）。
  管理UIはビューバーの鉛筆アイコン（ピル列と同じトラック内の末尾要素で、ピルと一緒に
  横スクロールする）から開く「ビューを編集」ボトムシート（`sheet-places`）に集約。
  並べ替え（グリップドラッグ、=ビューバーの順）・表示ON/OFF（目アイコン）・削除（ゴミ箱→
  既存の削除確認シートを経由。Workflowy側のノードは削除されない）ができる。組み込みは
  削除不可、最後の表示中ビューは非表示にできない。「＋ 場所を追加」（ノードツリーピッカーで
  新規登録）もこのシート内にあり、設定画面には「場所」関連のUIを置かない。シートの重なりは
  DOM順に依存するため、`sheet-places`は削除確認シート（`sheet-delete`）より前に配置する
  必要がある（シート内の削除操作で確認シートが手前に出るように）
- **タスク取得**: 検索APIが無いため`GET /nodes-export`（1req/min制限）を使用し、Worker側で
  `layoutMode: "todo"`のノードを抽出する。`/api/tasks`はNodesタブの進捗表示（done/total）のため
  完了済みも`completed`フラグ付きで返す。Cron通知は未完了のみ対象。クライアントは60秒TTLのキャッシュを持つ
- **Nodesタブのフィルタ**: TODOがすべて完了したノードはデフォルトで非表示。一覧右上のボタンで
  表示/非表示を切り替え、状態は`taskflowy_settings`の`showFinishedNodes`に保存する。
  判定は`filterFinishedNodes`（純粋関数）。TODOを1件も持たないノードは非表示の対象外
- **完了タスクの表示トグル**: 全ビュー（Today/Deadlinesタブ・Nodesドリルダウン・Daily・
  登録ノードビュー）で完了済みタスクをデフォルト非表示にし、一覧上部のボタンで表示/非表示を
  切り替える。状態はビュー/タブごとに独立で、`taskflowy_settings`の`showCompletedTasks`に
  スコープ（`today`/`due`/`nodes`/`daily`/場所id）をキーとするマップとして保存
  （`showCompletedFor`/`toggleShowCompleted`、`views.js`）。Today/Deadlinesでは表示ON時に
  末尾へ「完了」グループを追加する。Todayは「期限が今日 or 今日完了にしたもの」のみ、
  Deadlinesは全完了タスクを完了日（`completedAt`、無ければ期限で代用）の降順で直近7日分から
  表示し、スクロール下端で7日ずつ拡張する（Daily同様。完了が無い週はスキップ。純粋ロジックは
  `completedTasksForDueView`/`completedDateOf`/`countCompletedForView`、`tasks.js`）。
  メモ（非タスク）は常に表示。ほかの純粋ロジックは
  `filterCompletedItems`/`visibleDailyGroups`（`views.js`）と`groupNodeTasks`の第2引数（`tasks.js`）
- **Dailyビュー**: `GET /api/daily`が日付キーのプローブ（`GET /nodes?parent_id=YYYY-MM-DD`、
  404=その日なし）で日付グループを返す。新しい日付が上、下方向へ無限スクロール
  （`before_date`でページング）。ノート0件の日は見出しごと出さない。
  日付見出しは「日付＋曜日バッジ＋罫線＋件数」の帯（`dailyDateParts`、`views.js`）で、
  今日だけ曜日バッジを反転する
- **登録ノードビュー**: `GET /api/nodes/:id/children`で子（1階層）をWorkflowyの並び順のまま表示。
  タスクとメモが混在し、タスクは本文下のTODO/DONEタグだけで示す（タグタップで完了トグル）
- **検索ビュー**（Issue #9）: ビューバーの組み込み場所「Search」（`kind: 'search'`。
  `ensureSearchPlace`が保存済みの場所リストへ後付けする）。Workflowyに検索APIが無いため、
  `GET /api/search-index`が`nodes-export`の全ノード（タスク+メモ、完了済み含む）を
  ViewItem形+`parentId`で返し（`buildSearchIndex`、`src/api/search.ts`。親パスは
  ペイロード削減のため埋め込まず、クライアントが`attachSearchPaths`で復元）、
  クライアントが60秒TTLでキャッシュして全文一致をローカルで行う（`searchItems`、
  `views.js`。名前+メモ、空白区切りAND、NFKC+小文字+HTMLタグ除去で正規化。
  1クエリ=1リクエストにしないための設計で、`/tasks`と同じ1req/min制限に収まる。
  検索ビュー中の「今すぐ同期」はインデックスのみ更新し、`/tasks`との同時強制で
  片方が429になるのを避ける）。結果行は登録ノードビューと同じ行
  （`buildItemRow`、`origin: "search"`）で、スワイプ完了/削除・詳細シート・シートからの
  場所登録がそのまま使える。トップからのブレッドクラム行を出し（`showParent`+
  `searchPathLabel`。深い階層はルート側を「…」に畳んで直近の親を残す）、サブツリー展開の
  入口は子プレビューではなく右端シェブロン（`childEntry: "chevron"`。プレビューは
  行ごとに子取得が走るため、件数が読めない検索結果では使わない）。表示は50件で
  打ち切って絞り込みを促す。完了済み表示トグルはスコープ`search`。クエリは
  永続化せず、入力は200msデバウンス+Enterで即時確定
- **戻るボタン**: History APIと統合。レイヤー（シート/設定/ドリルダウン）を開くとき番兵の
  履歴エントリを1つ積み、popstateで最前面のレイヤーを1つ閉じる（残りがあれば積み直す）。
  閉じる順は`topUiLayer`（`views.js`の純粋関数）: 削除確認 > 送信先ピッカー > 詳細シート >
  サブツリードリルダウン > composeシート > ビューを編集シート > 設定 > ノード集計ドリルダウン。
  UIの閉じるボタン/背景タップは`history.back()`に流して同期し、何も開いていないときの
  戻るだけがアプリを出る
- **行操作（全ビュー統一）**: 右スワイプ=完了トグル、左スワイプ=削除（確認シートを挟んで
  `DELETE /api/nodes/:id`）、行タップ=詳細シート（Pointer Eventsでマウスドラッグにも対応）。
  詳細シートはタスク/メモでレイアウトを分ける（メモは時刻·場所+note面の読み物レイアウト）。
  期限は詳細シートの「明日へ」またはシート内の期限行タップ（チップ+任意日時、`{date: null}`で解除）。
  タイトルとメモはクリックしてその場で編集する。サブツリードリルダウンへの入口は行タップとは
  別の操作にする（下記）。長押しでの切り替えはChrome for Androidの標準長押しハンドリングに
  阻まれて発火しないため採用していない
- **サブツリードリルダウン**（Issue #16）: 任意ノードの子（1階層）を
  `GET /api/nodes/:id/children`で取得して新しい画面として重ね開く（`expandSubtree`、
  `client.js`）。子が0件ならトーストを出してその場に留まる。何階層でも重ね開けるスタック
  （`subtreeStack`）で、深さの上限や再帰取得は行わない（各画面は常に直下の子のみを取得する）。
  入口はビューによって異なる：Today/Deadlinesタブの行は右端のシェブロンボタン
  （`row-expand-chevron`、`buildExpandChevron`）をタップ。Daily/登録ノードビューの行は
  本文の下に先頭数件の子タイトルを薄く連ねたプレビュー（`child-preview`、
  `bindChildPreview`。子が無ければ何も出さない）をタップし、プレビュー自体が展開の
  入口を兼ねる。プレビューは行の描画後に各行が個別に`/nodes/:id/children`を取得する
  （一覧取得とは別リクエストで、表示件数ぶん増える）。画面のレンダリング
  （`renderItemListScreen`、登録ノードビューと共有）・行操作
  （完了トグル/削除/インライン編集含む）は登録ノードビューと同じ仕組みをそのまま再利用し、
  `origin: "subtree"`として扱う。ただし完了済み表示トグルの状態は起点ノードIDごとに
  独立したスコープ（`subtree:<nodeId>`）を持ち、階層をまたいで設定が衝突しない。
  LocalStorageには永続化せずメモリ上のみで保持し、ビュー/タブの切り替えでスタックは
  クリアされる。Dailyの日付見出し行はその日のノート一覧がDaily内にすでに展開表示されて
  いるため対象外（タップは従来通りデイリーノートの詳細シート）
- **インライン編集（タイトル／メモ）**: 別枠のエディタは出さず、表示している面を
  `contenteditable`にして直接書き換える（`bindInlineEdit`、`client.js`）。フォーカスが外れたら
  保存し、Escapeで取り消す。タイトルはEnterでも確定、メモは改行を許す。値が変わらなければ
  APIは呼ばない。対象は3か所：タイトル（`#sheet-task-title`、`POST /api/nodes/:id/name`）、
  タスクの「メモ」行（`#sheet-task-note`）、メモのnote面（`#sheet-item-note`。
  どちらも`POST /api/nodes/:id/note`）。メモレイアウトではnoteが空でもnote面を出し、
  「メモを追加」の誘い文句から書き足せる。シートを閉じるときは`commitInlineEdit`で
  書きかけを確定させる（`closeTopLayer`が`sheetTask`をnullにする前に呼ぶ）
- **タイトル編集**: クライアントは表示テキスト（`plainName`相当）だけを送り、サーバが
  `replaceNameText`（`time-markup.ts`）で既存の`<time>`マークアップを付け直す。よって
  リネームで期限が消えない。空タイトルは拒否する。Workflowyのインライン装飾（`<b>`など）は
  表示テキストに畳まれているため、リネームすると失われる
- **note ⇄ todo の切り替え**: 詳細シート下部の「メモにする」/「タスクにする」で
  `layoutMode`を切り替える（`POST /api/nodes/:id/layout`、`{todo: boolean}`。todo以外は
  Workflowy既定の`"bullets"`）。ラベルは`layoutActionLabel`（`views.js`）。Tasksビューは
  layoutMode=todoのノードだけの一覧なので、メモに変えると`tasksState`から外してシートを閉じる。
  逆にタスクにしたときは`tasksState`へ加える（親のパスは次の取得で埋まる）。
  状態の書き換えはAPI成功後に行う（完了トグルと違い楽観更新にしない）
- **日付ノードの行操作**: Dailyの日付見出しも項目行と同じ操作対象。タップ=デイリーノートの
  詳細シート（見出し「デイリーノート」+タイトル`YYYY/M/D（曜）`=`dailyNoteTitle`、
  Workflowyで開く+削除のみ）、左スワイプ=その日ごと削除（`DELETE /api/nodes/YYYY-MM-DD`。
  日付キーがそのままノード識別子として通る）。日付に完了の概念がないため右スワイプと
  「完了にする」は持たせない（`bindRowSwipe`の`deleteOnly`、`resolveSwipeAction`/`clampDx`）
- **リッチテキスト描画**（Issue #13）: Workflowyはインライン装飾をノード名/noteのHTMLタグとして
  保存する（`<b>`/`<i>`/`<u>`/`<s>`/`<code>`/`<a href>`/`<span class="colored c-red">`等）。
  行タイトル（`buildTaskRow`/`buildItemRow`）と詳細シート（タイトル・メモ・note面）は
  `richtext.js`のサニタイザを通して描画する（`setRichTitle`/`setRichNote`、`client.js`）。
  ホワイトリスト外のタグはテキストへ畳み、属性は落とす（イベントハンドラ・`javascript:`等の
  XSSベクタはここで遮断。テキストのエスケープはシリアライザ任せ）。`renderRichTitle`は
  旧`normalizeTitle`と同じ正規化（絵文字除去・空白畳み・先頭タイムスタンプ除去・`<time>`除去）を
  タグを保ったまま行い、空になれば呼び出し側が「（無題）」に落とす。裸のURLはリンク化する。
  画像はテキストを置き換えない: 画像URL（拡張子判定`isImageUrl`の裸URL/`<a>`リンク、および
  `<img>`タグ）はURLリンクとして本文の流れの中に残したまま、サムネイル
  `<img class="rt-img">`を本文の後ろにまとめて表示する（「おおお URL ははは」の
  テキストが読めたまま画像が下に付く。同一URLは1枚に畳む。一覧では高さ72px、
  詳細シートでは240pxにCSSで制限）。行内のリンクタップは
  行タップ（詳細シート）にせずリンク遷移、シート内のリンクタップはインライン編集を
  開始しない（画像タップは編集開始）。
  編集用のプレーンテキスト化は`plainTextWithImageUrls`で`<img>`をURLテキストに落とし、
  編集に入っただけで画像のURLが失われないようにする。編集開始時は面がプレーンテキストに
  置き換わるため、リネーム/メモ保存で装飾が失われる仕様は従来通り。色クラス（`c-*`/`bc-*`）はCharcoalに合わせた低彩度の写像を
  `main.css`に定義。親パス・子プレビュー・削除確認・トースト等はプレーン表示のまま
- **期日**: ノード名内の`<time startYear=...>`マークアップが正。`/nodes/:id/schedule`が
  このマークアップを設定/置換する
- **繰り返しタスク**（Issue #26）: Workflowyに繰り返し機能がないため繰り越し方式で実装。
  完了操作はTaskflowy経由のみが前提。ルールは固定スケジュール（毎日/毎週◯曜/毎月N日）で
  KVの`recur:rules`（ノードIDキー）に保存し、クライアントは起動時に`GET /api/recur`で取得して
  LocalStorageにミラーする。繰り返しタスクの完了は`POST /api/recur/:id/complete`が
  「完了記録をKVの`recur:completions`へ保存（90日で刈り込み）＋期日マークアップを次回へ差し替え」を
  行い、Workflowy側のノードは完了させない。遅れて完了しても過ぎた回はスキップして
  「クライアントのローカル日付より後の直近の該当日」に進む（期日の時刻は引き継ぐ）。
  完了記録は`/api/tasks`が仮想の完了タスク（`virtual: true` + 取り消し用の`recurDate`）として
  合流させ、Today/Deadlinesの完了グループに出る。仮想行の右スワイプ=`/uncomplete`
  （記録の`prevDue`で期日を戻す）。仮想行は実ノードを消してしまうため左スワイプ削除と
  シートの削除ボタンを持たない（`resolveSwipeAction`/`clampDx`の`completeOnly`）。
  Nodesタブの集計（done/total）は完了のたびに膨らむため仮想行を除外する。
  ルール設定の入口は2か所: 詳細シートの「繰り返し」行と、composeタスクモードの
  「繰り返し」チップ行（追加成功後に`PUT /api/recur/:item_id`。チップはシートを開くたび
  「なし」に戻る）。どちらもなし/毎日/毎週/毎月のチップで、毎週・毎月は期限の日、
  なければ今日を基準にする（`recurLabel`/`recurRuleFor`、`views.js`）。
  ルール設定/解除時はサーバーがノードのnote末尾に`#recurring`タグを付け外しし、
  Workflowy側からも繰り返しと分かるようにする（`addRecurTag`/`removeRecurTag`、`recur.ts`）。
  タグは目印であってKVが正（消えても動作に影響しない）。Taskflowyのメモ欄でも隠さない
  （隠すとメモ編集での保全ロジックが要るため。クライアントは`addRecurTagText`/
  `removeRecurTagText`（`views.js`）でローカルのnoteを同期し、設定直後のメモ編集で
  タグが消えないようにしている）。
  期日マークアップを進めるだけなので通知系（朝まとめ・時刻付き・overdue反復）は無改修で動く
- **compose**: FABから開くシート。タスク/ノートの2モード+送信先セレクタ（Daily 今日/明日/来週/
  任意日付、登録済みの場所、ノードツリー選択）。既定の送信先は表示中のビューに対応する場所
  （Tasks/DailyビューはDaily 今日）。挿入位置はシート本体の軽いトグル（▼ 末尾 / ▲ 先頭。
  タスクモードは書き込み先ボタン横、ノートモードは下端ツールバー。`togglePosition`/
  `positionLabel`、`views.js`）で切り替え、`taskflowy_settings`の`composePosition`に保存
  （既定は末尾）。送信後は既定でシートが閉じる。追加ボタン横の
  「連続」チップで連続追加モードをONにすると、シートを開いたまま入力だけ初期化して
  続けて書ける（閉じるのは背景タップ、または空のまま追加）。連続追加はシートを開くたび
  OFFに戻る一時的なモードで永続化しない（`afterSendAction`、`views.js`）。タスク/ノートの
  モードは`composeMode`として保存され、次回開いたときに復元される。
  ノートは最初の空行でname/noteに分割（`splitNoteDraft`）。「書き込み先の日付」と「期限」は
  別概念で、日付を指定するUIをそれぞれ1か所に限定している
- **書き込み先**: `POST /api/send`。`targetType: "node" | "calendar"`。`calendar`は`day`キー
  （`today`/`tomorrow`/`next_week`/`YYYY-MM-DD`）を受け、Day NodeはWF側でオンデマンド作成。
  `position: "top" | "bottom"`（任意）で親ノード内の挿入位置を指定できる。
  クライアントは常にローカル日付を明示して送る（サーバーTZに依存しない）
- **通知**: 自前Web Push（VAPID）+ Cron Trigger（5分間隔、`wrangler.toml`の`[triggers]`）。
  時刻付きタスクは期日時刻を過ぎたら即時（1タスク=1通知）。朝`morningHour`
  （KV設定、デフォルト9）JSTのまとめ通知は「その日が期日のタスク」+「期日を過ぎても
  未完了のタスク（期限切れセクション。キーが`overdue:<今日>:<taskId>`のため、完了/期限変更
  されるまで毎朝繰り返す）」を1通知に束ねる。期限切れのみでも発火する。時刻付きタスクの
  個別通知だけは、期日から24時間より古い分を初回導入時の通知バーストを避けるため送信せず
  「通知済み」として記録する（まとめ通知側には出る）。判定ロジックは
  `selectDueNotifications`（純粋関数、`src/test/notify.test.ts`にテストあり）

## Environment Variables (wrangler.toml)

- `ENCRYPTION_KEY` - APIキー暗号化用キー
- `ALLOWED_ORIGINS` - CORS許可オリジン（カンマ区切り）
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` - Web Push用VAPID鍵
  （secretとして設定。`npm run generate-vapid-keys`で生成）

## KV Namespace

- `KV` - 通知機能用データを保存。スキーマは`src/api/kv-store.ts`のコメントを参照
  （Push購読リスト、通知済み記録、通知設定、暗号化APIキーのミラー）
