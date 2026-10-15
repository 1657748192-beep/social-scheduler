"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import COS from "cos-js-sdk-v5";
import { apiRequest, apiUpload, UploadHttpError,type CosUploadIntent, type MediaAsset } from "../../lib/api";
import { useLanguage } from "../LanguageProvider";
import {createMediaThumbnail} from '../../lib/mediaThumbnail';
import {uploadLocalVideo,forgetLocalUploadSession,type LocalUploadProgress} from '../../lib/localChunkUpload';
import {localUploadRequest} from '../../lib/localUploadTransport';
import {CHUNK_THRESHOLD_BYTES,type UploadCapabilities} from '../../lib/localUploadProtocol';

const maxMediaSizeBytes = 250 * 1024 * 1024;
const uploadConcurrency = 2;

type UploadType = "image" | "video";

type UploadItem = {
  id: string;
  file: File;
  type: UploadType;
  progress: number;
  status: "uploading" | "failed";
  error?: string;
  detail?:LocalUploadProgress;
  ownerUserId?:string;
  retryAt?:number;
};

type MediaUploaderProps = {
  workspaceId: string;
  token: string;
  media: MediaAsset[];
  label: string;
  description: string;
  disabled?: boolean;
  onMediaChange: (media: MediaAsset[]) => void;
};

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function newUploadId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`;
}

function uploadToCos(intent: CosUploadIntent, file: File, onProgress: (percent: number) => void) {
  const cos = new COS({
    getAuthorization: (_options, callback) => {
      callback({
        TmpSecretId: intent.credentials.tmpSecretId,
        TmpSecretKey: intent.credentials.tmpSecretKey,
        SecurityToken: intent.credentials.sessionToken,
        StartTime: intent.credentials.startTime,
        ExpiredTime: intent.credentials.expiredTime
      });
    }
  });

  return cos.uploadFile({
    Bucket: intent.bucket,
    Region: intent.region,
    Key: intent.key,
    Body: file,
    ContentType: file.type,
    SliceSize: 8 * 1024 * 1024,
    ChunkSize: 4 * 1024 * 1024,
    onProgress: ({ percent }) => onProgress(Math.min(100, Math.round(percent * 100)))
  });
}

export function MediaUploader({
  workspaceId,
  token,
  media,
  label,
  description,
  disabled = false,
  onMediaChange
}: MediaUploaderProps) {
  const { t } = useLanguage();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef(media);
  const [uploadingType, setUploadingType] = useState<UploadType | null>(null);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);
  const [uploadNotice,setUploadNotice]=useState<string|null>(null);
  const [clock,setClock]=useState(Date.now());
  const scope=`${workspaceId}\0${token}`,scopeRef=useRef(scope),mounted=useRef(true);
  scopeRef.current=scope;
  const controllers=useRef(new Map<string,AbortController>()),cancelled=useRef(new Set<string>());
  const capabilities=useRef<{scope:string;controller:AbortController;promise:Promise<UploadCapabilities|null>}|null>(null);

  useEffect(()=>{
    mounted.current=true;setUploadItems([]);setUploadingType(null);setUploadNotice(null);cancelled.current.clear();
    return ()=>{mounted.current=false;for(const controller of controllers.current.values())controller.abort();controllers.current.clear();capabilities.current?.controller.abort();capabilities.current=null;};
  },[workspaceId,token]);
  const waitingForRetry=uploadItems.some(item=>(item.retryAt??0)>clock);
  useEffect(()=>{if(!waitingForRetry)return;const timer=setInterval(()=>setClock(Date.now()),1000);return ()=>clearInterval(timer);},[waitingForRetry]);

  useEffect(() => {
    mediaRef.current = media;
  }, [media]);

  const isUploading = Boolean(uploadingType);
  const imageCount = media.filter((asset) => asset.mimeType.startsWith("image/")).length;
  const videoCount = media.filter((asset) => asset.mimeType.startsWith("video/")).length;

  function updateMedia(nextMedia: MediaAsset[]) {
    mediaRef.current = nextMedia;
    onMediaChange(nextMedia);
  }

  function updateUpload(id: string, patch: Partial<UploadItem>) {
    setUploadItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function validateFile(file: File, type: UploadType) {
    if (file.size > maxMediaSizeBytes) {
      return t(`文件超过 ${formatFileSize(maxMediaSizeBytes)} 上限`,`File exceeds the ${formatFileSize(maxMediaSizeBytes)} limit`);
    }

    if (!file.type.startsWith(`${type}/`)) {
      return type === "image" ? t("请选择有效的图片文件","Choose a valid image") : t("请选择有效的视频文件","Choose a valid video");
    }

    return null;
  }

  function getCapabilities(){
    if(capabilities.current?.scope===scope)return capabilities.current.promise;
    const controller=new AbortController();
    const promise=localUploadRequest<UploadCapabilities>(`/workspaces/${workspaceId}/media/upload-capabilities`,token,{method:'GET',timeoutMs:30000,signal:controller.signal}).catch(error=>{
      if(error instanceof UploadHttpError&&error.status===404)return null;
      if(capabilities.current?.controller===controller)capabilities.current=null;throw error;
    });
    capabilities.current={scope,controller,promise};return promise;
  }

  function capabilityFor(signal:AbortSignal){
    const promise=getCapabilities();
    return new Promise<UploadCapabilities|null>((resolve,reject)=>{
      const abort=()=>{signal.removeEventListener('abort',abort);reject(new DOMException('Upload cancelled','AbortError'));};
      if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});
      promise.then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
    });
  }

  function uploadError(error:unknown){
    if(error instanceof UploadHttpError){
      if(error.code==='retry_paused')return t('服务器要求稍后重试，已保留上传进度。','The server requested a pause. Upload progress is preserved.');
      if(error.status===410||error.code==='manifest_conflict')return t('原上传已过期或文件不一致，请点击重试重新开始。','The upload expired or the file changed. Retry to start again.');
      if(error.status===401)return t('登录已过期，请重新登录。','Your session expired. Please sign in again.');
      if(error.status===403)return t('当前没有上传权限，请检查账号权限。','Upload is not permitted. Check your account access.');
      if(error.status===507)return t('服务器空间不足，请稍后重试。','The server has insufficient storage. Please retry later.');
      if(error.code==='browser_unsupported')return t('当前浏览器不支持分块读取，请使用新版浏览器。','Use a current browser that supports reading file chunks.');
    }
    return error instanceof Error?error.message:t('上传失败，请重试','Upload failed. Please retry.');
  }

  async function uploadOne(item: UploadItem) {
    if(cancelled.current.has(item.id))return;
    const controller=new AbortController();controllers.current.set(item.id,controller);
    const current=()=>mounted.current&&scopeRef.current===scope&&!controller.signal.aborted&&!cancelled.current.has(item.id);
    const patch=(value:Partial<UploadItem>)=>{if(current())updateUpload(item.id,value);};
    patch({ error: undefined, progress: 0, status: "uploading",retryAt:undefined,detail:undefined,ownerUserId:undefined });

    try {
      let asset: MediaAsset;
      const cap=item.type==='video'&&item.file.size>=CHUNK_THRESHOLD_BYTES?await capabilityFor(controller.signal):null;
      controller.signal.throwIfAborted();
      if(cap?.protocol==='local-chunks-v1'){
        if(!/^[a-f0-9-]{36}$/i.test(cap.ownerUserId))throw new UploadHttpError('Invalid upload owner',400);
        patch({ownerUserId:cap.ownerUserId});
        let coverReady!:(value:Blob|null)=>void;
        const cover=new Promise<Blob|null>(resolve=>{coverReady=resolve;});
        const uploading=uploadLocalVideo({file:item.file,userId:cap.ownerUserId,workspaceId,token,signal:controller.signal,thumbnail:cover,onProgress:detail=>patch({detail,progress:Math.min(99,Math.floor((detail.confirmedBytes+detail.inflightBytes)/detail.totalBytes*100))})});
        void createMediaThumbnail(item.file,item.type,{timeoutMs:5000,signal:controller.signal}).then(coverReady,()=>coverReady(null));
        asset=await uploading;
      }else{
      try {
        const intent = await apiRequest<CosUploadIntent>(`/workspaces/${workspaceId}/media/cos/intent`, {
          token,
          signal:controller.signal,
          method: "POST",
          body: {
            originalName: item.file.name,
            mimeType: item.file.type,
            sizeBytes: item.file.size
          }
        });
        await uploadToCos(intent, item.file, (percent) => patch({ progress: Math.min(99,percent) }));
        asset = await apiRequest<MediaAsset>(`/workspaces/${workspaceId}/media/cos/complete`, {
          token,
          signal:controller.signal,
          method: "POST",
          body: { assetId: intent.assetId }
        });
      } catch (cosError) {
        const isLocalStorage =
          cosError instanceof Error && cosError.message === "COS direct upload is not enabled on this server";

        if (!isLocalStorage) {
          throw cosError;
        }

        const formData = new FormData();
        formData.append("file", item.file);
        const thumbnail = await createMediaThumbnail(item.file, item.type,{timeoutMs:5000,signal:controller.signal});

        if (thumbnail) {
          formData.append("thumbnail", new File([thumbnail], "thumbnail.jpg", { type: "image/jpeg" }));
        }

        asset = await apiUpload<MediaAsset>(`/workspaces/${workspaceId}/media`, token, formData, {
          signal:controller.signal,
          onProgress: ({ percent }) => patch({ progress: Math.min(99,percent) })
        });
      }
      }
      if(!current())return;
      updateMedia([...mediaRef.current, asset]);
      setUploadItems((current) => current.filter((upload) => upload.id !== item.id));
    } catch (requestError) {
      if(!current())return;
      const retryAt=requestError instanceof UploadHttpError&&requestError.retryAfterMs?Date.now()+requestError.retryAfterMs:undefined;
      setClock(Date.now());patch({
        status: "failed",
        error: uploadError(requestError),retryAt
      });
    }finally{controllers.current.delete(item.id);}
  }

  async function runUploadQueue(items: UploadItem[], type: UploadType) {
    setUploadingType(type);
    let nextIndex = 0;

    async function worker() {
      while (nextIndex < items.length) {
        const item = items[nextIndex];
        nextIndex += 1;
        if(scopeRef.current!==scope||!mounted.current)return;
        if(cancelled.current.has(item.id)){cancelled.current.delete(item.id);continue;}
        await uploadOne(item);
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(uploadConcurrency, items.length) }, () => worker())
    );
    if(mounted.current&&scopeRef.current===scope)setUploadingType(null);
  }

  async function uploadMedia(event: ChangeEvent<HTMLInputElement>, type: UploadType) {
    if (disabled) {
      return;
    }

    const files = Array.from(event.target.files ?? []);
    setUploadNotice(null);
    event.target.value = "";

    if (!files.length) {
      return;
    }

    const items = files.map<UploadItem>((file) => {
      const error = validateFile(file, type);
      return {
        id: newUploadId(file),
        file,
        type,
        progress: 0,
        status: error ? "failed" : "uploading",
        error: error ?? undefined
      };
    });
    const acceptedItems = items.filter((item) => !item.error);

    setUploadItems((current) => [...current, ...items]);

    if (acceptedItems.length) {
      await runUploadQueue(acceptedItems, type);
    }
  }

  async function retryUpload(item: UploadItem) {
    if (isUploading||(item.retryAt??0)>Date.now()) {
      return;
    }
    const error=validateFile(item.file,item.type);if(error){updateUpload(item.id,{error,status:'failed'});return;}
    await runUploadQueue([item], item.type);
  }

  async function cancelUpload(item:UploadItem){
    cancelled.current.add(item.id);controllers.current.get(item.id)?.abort();
    setUploadItems(current=>current.filter(upload=>upload.id!==item.id));
    if(item.detail?.sessionId&&item.ownerUserId){
      const sessionId=item.detail.sessionId;
      try{
        const result=await localUploadRequest<{state:string;cleanupPending:boolean}>(`/workspaces/${workspaceId}/media/upload-sessions/${sessionId}`,token,{method:'DELETE',timeoutMs:30000,signal:new AbortController().signal});
        if(mounted.current&&scopeRef.current===scope)setUploadNotice(result.state==='completed'?t('上传已完成，素材未删除。','Upload already completed. The media was not deleted.'):result.cleanupPending?t('已停止上传，未完成分块将自动清理。','Upload stopped. Partial chunks will be cleaned automatically.'):t('已取消上传。','Upload cancelled.'));
      }catch{if(mounted.current&&scopeRef.current===scope)setUploadNotice(t('已停止上传，服务器残片将按到期策略清理。','Upload stopped. Server residue will expire automatically.'));}
      finally{forgetLocalUploadSession(item.ownerUserId,workspaceId,sessionId);}
    }
  }

  function removeMedia(id: string) {
    updateMedia(mediaRef.current.filter((asset) => asset.id !== id));
  }

  return (
    <section className="composer-panel media-panel">
      <p className="upload-hint platform-media-hint">{description}</p>
      <div className="row">
        <div>
          <p className="section-kicker">{t(`素材库 · ${label}`, `Media library · ${label}`)}</p>
          <h2>{t(`${label} 图片与视频`, `${label} images and videos`)}</h2>
        </div>
        <span className="muted">
          {t(`${imageCount} 图 / ${videoCount} 视频`, `${imageCount} images / ${videoCount} videos`)}
        </span>
      </div>

      <div className="upload-actions">
        <input
          accept="image/*"
          disabled={isUploading || disabled}
          multiple
          onChange={(event) => uploadMedia(event, "image")}
          ref={imageInputRef}
          type="file"
        />
        <input
          accept="video/*"
          disabled={isUploading || disabled}
          multiple
          onChange={(event) => uploadMedia(event, "video")}
          ref={videoInputRef}
          type="file"
        />
        <button
          className="upload-drop"
          disabled={isUploading || disabled}
          onClick={() => imageInputRef.current?.click()}
          type="button"
        >
          <strong>{uploadingType === "image" ? t("图片上传中…", "Uploading images...") : t("添加图片", "Add images")}</strong>
          <span>{t("支持多张图片，单个最大 250 MB", "Multiple images supported, up to 250 MB each")}</span>
        </button>
        <button
          className="upload-drop video"
          disabled={isUploading || disabled}
          onClick={() => videoInputRef.current?.click()}
          type="button"
        >
          <strong>{uploadingType === "video" ? t("视频上传中…", "Uploading videos...") : t("添加视频", "Add videos")}</strong>
          <span>{t("支持并行上传，单个最大 250 MB", "Parallel upload supported, up to 250 MB each")}</span>
        </button>
      </div>
      <p className="upload-hint">{t('支持续传的大视频，刷新页面后需重新选择同一文件。','For resumable videos, select the same file after refreshing the page.')}</p>
      {uploadNotice?<p className="upload-hint" role="status">{uploadNotice}</p>:null}

      {uploadItems.length ? (
        <div className="upload-queue" aria-live="polite">
          {uploadItems.map((item) => (
            <div className={item.status === "failed" ? "upload-queue-item failed" : "upload-queue-item"} key={item.id}>
              <div className="upload-queue-heading">
                <span>
                  <strong>{item.file.name}</strong>
                  <small>{formatFileSize(item.file.size)}</small>
                </span>
                {item.status === "uploading" ? <em>{item.progress}%</em> : null}
                {item.status === "failed" ? (
                  <button disabled={isUploading||(item.retryAt??0)>clock} onClick={() => retryUpload(item)} type="button">
                    {t("重试", "Retry")}
                  </button>
                ) : null}
                <button onClick={()=>void cancelUpload(item)} type="button">{t('取消','Cancel')}</button>
              </div>
              {item.status === "uploading" ? (
                <div className="upload-progress-track" aria-label={t(`${item.file.name} 上传进度`, `${item.file.name} upload progress`)}>
                  <span style={{ width: `${item.progress}%` }} />
                </div>
              ) : null}
              {item.error ? <p>{item.error}</p> : null}
              {item.retryAt&&item.retryAt>clock?<p>{t('可重试时间：','Retry after: ')}{new Date(item.retryAt).toLocaleTimeString()}</p>:null}
              {item.detail?<>
                <p>{item.detail.phase==='preparing'?t('准备文件…','Preparing file...'):item.detail.phase==='finalizing'?t('合并确认中…','Finalizing upload...'):t('分块上传中…','Uploading chunks...')}</p>
                <small>{t('已确认','Confirmed')} {formatFileSize(item.detail.confirmedBytes)} / {formatFileSize(item.detail.totalBytes)}
                {item.detail.phase==='uploading'?<> · {item.detail.speedBytesPerSecond?`${formatFileSize(item.detail.speedBytesPerSecond)}/s`:t('速度计算中','Speed unavailable')} · {item.detail.remainingSeconds!==null?t(`约剩余 ${Math.ceil(item.detail.remainingSeconds)} 秒`,`About ${Math.ceil(item.detail.remainingSeconds)} seconds remaining`):t('剩余时间未知','Remaining time unknown')}</>:null}</small>
                {!item.detail.canResumeAfterReload?<p>{t('浏览器无法保存续传记录：本页可重试，刷新后不能保证续传。','Browser storage is unavailable: retry on this page; resuming after refresh is not guaranteed.')}</p>:null}
              </>:null}
            </div>
          ))}
        </div>
      ) : null}

      {media.length ? (
        <div className="media-grid">
          {media.map((asset) => {
            const isVideo = asset.mimeType.startsWith("video/");
            const thumbnailUrl = asset.thumbnailUrl ?? asset.fileUrl;

            return (
              <article className="media-thumb" key={asset.id}>
                <div className="media-thumb-visual">
                  {thumbnailUrl ? (
                    <>
                      <img alt={isVideo ? t("视频首帧缩略图", "Video cover thumbnail") : t("图片素材缩略图", "Image thumbnail")} src={thumbnailUrl} />
                      {isVideo ? <span className="media-badge">{t("视频", "Video")}</span> : null}
                    </>
                  ) : (
                    <span className="media-badge">{t("缩略图不可用", "No thumbnail")}</span>
                  )}
                </div>
                <div className="media-thumb-footer">
                  <span>{isVideo ? t("视频素材", "Video") : t("图片素材", "Image")}</span>
                  <div className="media-thumb-actions">
                    <button onClick={() => setPreviewAsset(asset)} type="button">
                      {isVideo ? t("观看视频", "Watch video") : t("预览图片", "Preview image")}
                    </button>
                    <button className="media-remove" onClick={() => removeMedia(asset.id)} type="button">
                      {t("移除", "Remove")}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="upload-hint">{t("上传后会显示缩略图；可预览素材或将其移除。", "A thumbnail appears after upload. Preview or remove media here.")}</p>
      )}

      {previewAsset ? (
        <div
          className="media-preview-backdrop"
          onClick={() => setPreviewAsset(null)}
          role="presentation"
        >
          <section
            aria-label={previewAsset.mimeType.startsWith("video/") ? t("视频预览", "Video preview") : t("图片预览", "Image preview")}
            aria-modal="true"
            className="media-preview-dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="media-preview-header">
              <div>
                <p className="section-kicker">{t("素材预览", "Media preview")}</p>
                <h2>{previewAsset.mimeType.startsWith("video/") ? t("观看视频", "Watch video") : t("预览图片", "Preview image")}</h2>
              </div>
              <button aria-label={t("关闭预览", "Close preview")} onClick={() => setPreviewAsset(null)} type="button">
                ×
              </button>
            </header>
            <div className="media-preview-content">
              {previewAsset.mimeType.startsWith("video/") ? (
                <video autoPlay controls playsInline preload="metadata" src={previewAsset.fileUrl} />
              ) : (
                <img alt={t("图片素材预览", "Image media preview")} src={previewAsset.fileUrl} />
              )}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
