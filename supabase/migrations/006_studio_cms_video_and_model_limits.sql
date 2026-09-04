-- Phase 2/3: 動画・3Dモデル対応にあわせて、user_ar_assetsバケットの
-- アップロード制限（ファイルサイズ・許可するMIMEタイプ）を設定する。
-- 005番でバケット自体は作成済みのため、ここではupdateのみ行う。

update storage.buckets
set
  file_size_limit = 52428800, -- 50MB（動画の上限に合わせる。画像・3Dモデルはアプリ側でさらに小さい上限を課している）
  allowed_mime_types = array[
    'image/png', 'image/jpeg', 'image/webp',
    'video/mp4',
    'model/gltf-binary', 'model/gltf+json', 'application/octet-stream'
  ]
where id = 'user_ar_assets';
