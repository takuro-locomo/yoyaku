/**
 * LineHandler.gs - LINE Messaging API Webhook ハンドラ (スタブ)
 *
 * このファイルは Step 2 で実装する。
 * 現時点では doPost からの呼び出しを受け付けるインターフェースのみ定義する。
 */

const LineHandler = (() => {

  /**
   * LINE Webhook リクエストを処理する。
   *
   * @param {object} e        - GAS イベントオブジェクト (署名検証に使用)
   * @param {object} body     - パース済み Webhook ボディ
   * @returns {TextOutput}
   */
  function handle(e, body) {
    // TODO Step 2: X-Line-Signature ヘッダー検証を実装する
    // const signature = e.parameter['X-Line-Signature'] || '';
    // _verifySignature(e.postData.contents, signature);

    const events = body.events || [];
    events.forEach(event => {
      try {
        _dispatchEvent(event);
      } catch (err) {
        Logger.log(`LINE event handling error: ${err.message}\n${err.stack}`);
      }
    });

    // LINE Webhook は常に 200 OK を返す必要がある
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  /**
   * イベントタイプに応じてハンドラに振り分ける。
   */
  function _dispatchEvent(event) {
    switch (event.type) {
      case 'message':
        // TODO Step 2: _handleMessage(event) を実装する
        Logger.log(`[LINE] message event from ${event.source.userId}: ${JSON.stringify(event.message)}`);
        break;
      case 'postback':
        // TODO Step 2: _handlePostback(event) を実装する
        Logger.log(`[LINE] postback event from ${event.source.userId}: ${event.postback.data}`);
        break;
      case 'follow':
        // TODO Step 2: フォロー時に患者登録フローを開始する
        Logger.log(`[LINE] follow event from ${event.source.userId}`);
        break;
      default:
        Logger.log(`[LINE] unhandled event type: ${event.type}`);
    }
  }

  return { handle };
})();
