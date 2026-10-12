/**
 * 图片输入处理工具（多模态对话）
 * <p>
 * 粘贴 / 选择的图片统一转为 data URI（OpenAI image_url 规范的内联形态）：
 * 超长边压到 MAX_EDGE 以内，体积大时转 JPEG 压缩，小图保留原格式。
 * 上限约束与后端 orrery-butler-service 入口校验保持一致。
 * </p>
 */

/** 单条消息允许携带的图片数量上限（与后端 MAX_IMAGES 一致） */
export const MAX_IMAGES = 4;

/** 图片长边上限（像素），超出按比例缩小 */
const MAX_EDGE = 1600;

/** 原图字节数上限（超过拒绝读取，防超大文件撑爆内存） */
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

/** 原图小于该字节数时保留原格式直接内联（PNG 截图等无损场景） */
const KEEP_ORIGINAL_BYTES = 300 * 1024;

/** JPEG 压缩质量 */
const JPEG_QUALITY = 0.9;

/**
 * 读取图片文件并转为 data URI（必要时缩放 / 转 JPEG 压缩）。
 *
 * @param file 图片文件（剪贴板粘贴或文件选择器产出）
 * @returns data URI（data:image/...;base64,...）
 * @throws Error 非图片类型或超过大小上限
 */
export const fileToImageDataUrl = async (file: File): Promise<string> => {
  if (!file.type.startsWith('image/')) {
    throw new Error(`不支持的文件类型：${file.type || '未知'}`);
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('图片超过 15MB，请先压缩后再上传');
  }
  const rawDataUrl = await readAsDataUrl(file);
  // 小图保留原格式（截图 PNG 无损内联，免二次压缩失真）
  if (file.size <= KEEP_ORIGINAL_BYTES) {
    return rawDataUrl;
  }
  return downscale(rawDataUrl);
};

/** File → data URI（不缩放）。 */
const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });

/** data URI → 画布缩放 → JPEG data URI（长边 ≤ MAX_EDGE）。 */
const downscale = (dataUrl: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('浏览器不支持图片处理'));
        return;
      }
      // JPEG 无透明通道：白底填充避免透明图转黑底
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    };
    img.onerror = () => reject(new Error('图片解析失败'));
    img.src = dataUrl;
  });
