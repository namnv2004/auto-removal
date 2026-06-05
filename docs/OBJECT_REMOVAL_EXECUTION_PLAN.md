# Ke Hoach Thuc Thi Du An Xoa Vat The Khoi Hinh Anh

## 1. Muc Tieu

Xay dung demo ca nhan cho bai toan xoa vat the khoi hinh anh voi uu tien cao nhat la chat luong ket qua, khong toi uu qua som ve chi phi hoac toc do.

Muc tieu demo:

- Upload anh.
- Chon vat the can xoa bang click, box hoac ve mask.
- Segment vat the bang model segmentation.
- Cho phep preview va chinh mask.
- Tai tao vung bi xoa bang model inpainting chat luong cao.
- Tra ve anh ket qua va luu lich su ket qua.
- Deploy len Kubernetes (minikube local) de co moi truong production-like.

## 2. Quyet Dinh Model

### 2.1. Segmentation Model

Lua chon chinh:

```text
SAM 3, neu co checkpoint/API on dinh va license phu hop
```

Fallback neu SAM 3 chua san sang de self-host:

```text
SAM 2.1 Large hoac HQ-SAM
```

Ly do:

- Can mask chinh xac vi mask sai se lam inpainting that bai.
- SAM-family phu hop voi object selection bang point/box.
- SAM 2.1 Large/HQ-SAM la fallback thuc te neu SAM 3 kho self-host hoac khong co checkpoint ro rang.

Neu can chon vat the bang text, them:

```text
GroundingDINO hoac Florence-2
```

Text flow:

```text
User prompt: "remove the dog"
-> GroundingDINO/Florence-2 detect box
-> SAM tao mask tu box
-> User preview/chinh mask
```

Cho demo nho, nen uu tien point/box truoc. Text prompt la tinh nang mo rong.

### 2.2. Reconstruction / Inpainting Model

Lua chon chinh cho chat luong cao:

```text
BrushNet-SDXL Inpainting hoac PowerPaint-SDXL
```

Fallback production-friendly:

```text
SDXL Inpainting
```

Fallback cho nen texture don gian:

```text
Big-LaMa
```

Quyet dinh cho demo:

```text
Primary: BrushNet-SDXL hoac PowerPaint-SDXL
Secondary: Big-LaMa prefill/fallback
```

Ly do:

- SDXL-based inpainting cho ket qua dep hon voi vung mask lon va can tai tao ngu nghia.
- BrushNet/PowerPaint thuong cho mask-conditioned inpainting tot hon SDXL inpainting co ban.
- LaMa rat tot voi tuong, co, troi, duong, san nha, texture lap lai; co the dung de prefill truoc khi chay diffusion.
- Demo nho nen chap nhan latency cao hon de doi lay chat luong.

## 3. Pipeline Chat Luong Cao

Pipeline chuan:

```text
Upload Image
-> Validate Image
-> Normalize Orientation/Color
-> Resize Preview
-> User Select Object
-> SAM Segmentation
-> Mask Refinement
-> Optional LaMa Prefill
-> SDXL/BrushNet/PowerPaint Inpainting
-> Seamless Blend
-> Postprocess
-> Store Result
-> Return Result URL
```

## 4. Chi Tiet Tung Buoc

### 4.1. Upload Va Validate

Gioi han de demo on dinh:

```text
Max file size: 10-20 MB
Max long edge: 4096 px
Input formats: jpg, jpeg, png, webp
Output format: png cho quality, webp/jpeg cho preview
```

Xu ly can co:

- Kiem tra MIME type.
- Kiem tra file co doc duoc bang PIL/OpenCV.
- Normalize EXIF orientation.
- Convert ve RGB.
- Tao thumbnail preview.

### 4.2. Chon Vat The

MVP nen ho tro:

```text
Point prompt: user click vao vat the
Box prompt: user keo box quanh vat the
Brush edit: user to them/xoa bot mask
```

Uu tien UX:

- Hien mask overlay mau ro rang.
- Cho user confirm mask truoc khi remove.
- Cho user expand mask neu con vien/bong.

### 4.3. Segmentation

Flow:

```text
Original image
-> Resize cho SAM neu can
-> SAM image encoder
-> Prompt encoder voi point/box
-> Mask decoder
-> Lay 3 candidate masks
-> Chon mask tot nhat hoac cho user chon
```

Optimization quan trong:

```text
Cache image embedding theo image_id
```

Ly do:

- User co the click/box nhieu lan.
- Khong nen encode lai anh moi lan.
- Chi can chay mask decoder lai de preview nhanh hon.

### 4.4. Mask Refinement

Day la buoc quyet dinh chat luong.

Can lam:

```text
Fill holes
Remove small components
Dilate mask
Feather mask edge
Optional shadow expansion
```

Thong so mac dinh:

```text
small object: dilate 6-10 px
medium object: dilate 12-20 px
large object: dilate 1-2% long edge
feather radius: 3-8 px
```

Nguyen tac:

- Mask phai phu ca vien vat the.
- Mask nen bao gom bong do, reflection va artifact xung quanh.
- Neu mask qua sat object, ket qua se con vien hoac bong.
- Neu mask qua rong, model can hallucinate nhieu hon va co rui ro sai ngu canh.

### 4.5. Crop-Based Inpainting

Khong nen inpaint toan bo anh neu object chi nam trong mot vung nho.

Flow:

```text
mask -> bounding box
-> expand bbox voi padding
-> crop image va crop mask
-> resize crop den size phu hop model
-> inpaint crop
-> resize ve kich thuoc crop goc
-> blend vao original image
```

Padding de xuat:

```text
padding = max(64 px, 20-35% bbox size)
```

Loi ich:

- Giu nguyen phan anh khong lien quan.
- Giam VRAM.
- Tang do nhat quan mau sac va chi tiet.
- Ho tro anh do phan giai cao tot hon.

### 4.6. Inpainting Quality-First

Primary flow:

```text
crop_image + crop_mask
-> optional LaMa prefill
-> BrushNet-SDXL/PowerPaint-SDXL
-> output_crop
-> seamless blend
```

Prompt mac dinh:

```text
clean natural background, realistic, seamless, consistent lighting, detailed texture, high quality
```

Negative prompt:

```text
object, person, shadow, reflection, artifact, blur, distortion, duplicate, watermark, text, logo, deformed
```

Thong so diffusion khoi diem:

```text
steps: 30-50
guidance_scale: 4.5-7.5
strength: 0.85-1.0
sampler: DPM++ 2M Karras hoac scheduler tuong duong
seed: random, cho phep retry voi seed khac
```

Neu ket qua xau:

```text
Retry 1: tang mask dilation
Retry 2: doi seed
Retry 3: chay LaMa-only neu nen la texture lap lai
Retry 4: giam prompt strength neu bi hallucination qua nhieu
```

### 4.7. Blending Va Postprocess

Can lam:

- Alpha blend theo feathered mask.
- Match color/light giua output crop va original crop.
- Giu nguyen metadata can thiet neu co.
- Tao thumbnail ket qua.
- Luu anh goc, mask, crop debug va result de review.

Khong nen upscale mac dinh trong demo dau tien. Upscale nen la nut rieng `Enhance`.

## 5. Kien Truc He Thong Cho Demo Nho

Vi demo nho va uu tien chat luong, khong can phuc tap hoa bang microservices day du ngay tu dau.

Kien truc de xuat:

```text
Frontend Vite + React
-> FastAPI Backend
-> GPU Worker cung container hoac process rieng
-> MinIO/S3 luu anh
-> SQLite/PostgreSQL luu job metadata
```

Ban local:

```text
Vite + React frontend
FastAPI backend
Python worker
Local filesystem hoac MinIO
Docker Compose
```

Ban K8s (minikube local):

```text
Frontend (Deployment + Service)
Backend API (Deployment + Service)
GPU Worker (Deployment voi nodeSelector GPU)
MinIO (StatefulSet luu anh)
SQLite/PostgreSQL (StatefulSet hoac PersistentVolume)
Ingress (minikube tunnel hoac ingress-nginx)
```

## 6. API De Xuat

### 6.1. Upload

```http
POST /api/images
```

Response:

```json
{
  "image_id": "img_123",
  "preview_url": "...",
  "width": 1920,
  "height": 1080
}
```

### 6.2. Segment

```http
POST /api/images/{image_id}/segment
```

Body point prompt:

```json
{
  "type": "point",
  "points": [{ "x": 812, "y": 430, "label": 1 }]
}
```

Body box prompt:

```json
{
  "type": "box",
  "box": { "x1": 600, "y1": 220, "x2": 940, "y2": 760 }
}
```

Response:

```json
{
  "mask_id": "mask_123",
  "mask_url": "...",
  "area_ratio": 0.08
}
```

### 6.3. Remove Object

```http
POST /api/images/{image_id}/remove
```

Body:

```json
{
  "mask_id": "mask_123",
  "quality": "best",
  "prompt": "clean natural background, realistic, seamless",
  "negative_prompt": "object, shadow, artifact, text, watermark"
}
```

Response:

```json
{
  "job_id": "job_123",
  "status": "queued"
}
```

### 6.4. Job Status

```http
GET /api/jobs/{job_id}
```

Response:

```json
{
  "job_id": "job_123",
  "status": "completed",
  "result_url": "...",
  "duration_ms": 24000
}
```

## 7. Thu Muc Code De Xuat

Neu bat dau tu repo hien tai, co the to chuc nhu sau:

```text
.
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   ├── services/
│   │   │   ├── segmentation.py
│   │   │   ├── mask_refinement.py
│   │   │   ├── inpainting.py
│   │   │   └── storage.py
│   │   ├── workers/
│   │   └── models/
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── app/
│   ├── components/
│   └── package.json
├── infra/
│   ├── docker-compose.yml
│   └── k8s/
├── samples/
└── OBJECT_REMOVAL_EXECUTION_PLAN.md
```

## 8. Ke Hoach Trien Khai Theo Giai Doan

### Phase 1: Prototype Local

Muc tieu:

- Chay duoc pipeline tren local/GPU.
- Co script test voi anh mau.
- Luu output de so sanh.

Cong viec:

```text
1. Cai moi truong Python + PyTorch CUDA.
2. Tich hop SAM 3 hoac SAM 2.1 Large/HQ-SAM.
3. Tich hop BrushNet-SDXL/PowerPaint-SDXL.
4. Viet script:
   python scripts/remove_object.py --image samples/test.jpg --box x1,y1,x2,y2
5. Them mask refinement.
6. Them crop-based inpainting.
7. Luu debug outputs: original, mask, refined_mask, crop, result.
```

Tieu chi hoan thanh:

```text
Co it nhat 10 anh test.
Ket qua khong con vien vat the ro rang.
Nen sau khi xoa tu nhien trong da so truong hop.
```

### Phase 2: Backend API

Muc tieu:

- Co FastAPI service goi duoc tu frontend.
- API tach upload, segment, remove, job status.

Cong viec:

```text
1. Tao FastAPI app.
2. Them image validation.
3. Them storage local truoc, sau do abstract sang S3.
4. Them endpoint segment.
5. Them endpoint remove.
6. Them job status in-memory hoac SQLite.
7. Them logging thoi gian xu ly tung buoc.
```

Tieu chi hoan thanh:

```text
Frontend hoac curl co the upload -> segment -> remove -> lay result.
```

### Phase 3: Frontend Demo

Muc tieu:

- Demo co UX tot: upload, select, preview mask, remove, compare before/after.

Cong viec:

```text
1. Tao Next.js app.
2. Upload image component.
3. Canvas hien thi image.
4. Click/box selection.
5. Mask overlay.
6. Brush edit co ban.
7. Nut Remove Object.
8. Before/after slider.
9. Download result.
```

Tieu chi hoan thanh:

```text
Nguoi xem demo co the dung ma khong can ban giai thich.
```

### Phase 4: Docker Hoa

Muc tieu:

- Chay bang Docker de deploy len AWS de hon.

Cong viec:

```text
1. Tao Dockerfile backend GPU.
2. Tao Dockerfile frontend.
3. Tao docker-compose local.
4. Mount model cache volume.
5. Them env vars cho model path, S3, DB.
6. Test restart container khong mat model cache.
```

Tieu chi hoan thanh:

```text
docker compose up co the chay duoc demo local.
```

### Phase 5: Kubernetes (Minikube) Deploy

Muc tieu:

- Chay full stack tren minikube local de co moi truong production-like.
- Kien truc K8s co the chuyen sang AWS/EKS sau nay.

Lua chon de xuat:

```text
Minikube (Docker driver)
Kubernetes manifests (Deployment, Service, StatefulSet, Ingress)
MinIO (S3-compatible storage trong cluster)
NVIDIA GPU plugin (neu co GPU local)
Ingress-Nginx (minikube tunnel)
```

Cong viec:

```text
1. Tao K8s manifest cho backend (Deployment + Service).
2. Tao K8s manifest cho frontend (Deployment + Service).
3. Tao K8s manifest cho MinIO (StatefulSet + PVC).
4. Tao PersistentVolume cho model cache.
5. Tao ConfigMap cho env vars.
6. Tao Secret cho sensitive config.
7. Tao Ingress de expose API va frontend.
8. Apply va test tren minikube.
9. Tao script deploy bang kubectl apply -f k8s/.
10. Test full flow trong cluster.
```

Tieu chi hoan thanh:

```text
minikube start && kubectl apply -f k8s/ -> co the upload/segment/remove qua ingress URL.
```

### Phase 6: AWS/EKS Mo Rong (Future)

Muc tieu:

- Chuyen tu minikube local len AWS/EKS khi can public demo.
- Day la phase mo rong, khong phai critical path cua demo.

Khi nao can AWS/EKS:

```text
1. Can public URL cho nguoi khac dung.
2. Can GPU manh hon GPU local (VD: A10G, A100).
3. Can scale cho nhieu nguoi dung cung luc.
4. Can S3 durable storage thay vi MinIO.
```

Scope EKS sau nay:

```text
CPU node group: frontend/backend API
GPU node group: segmentation/inpainting worker
Ingress: AWS Load Balancer Controller
Storage: S3 ben ngoai cluster
Queue: SQS ben ngoai cluster
Registry: ECR
Auth to AWS: IRSA
Autoscaling: Karpenter hoac Cluster Autoscaler
```

## 9. K8s Architecture Cho Demo Local

Kien truc practical:

```text
User (localhost)
-> Ingress (minikube tunnel)
-> Frontend Service -> Frontend Pod (Vite + React)
-> Backend Service -> Backend Pod (FastAPI)
-> GPU Worker (cung Backend Pod hoac rieng)
-> MinIO Service -> MinIO Pod (S3-compatible storage)
-> SQLite PVC hoac PostgreSQL Pod
```

Cac thanh phan K8s:

```text
k8s/
  frontend-deployment.yaml
  frontend-service.yaml
  backend-deployment.yaml
  backend-service.yaml
  minio-statefulset.yaml
  minio-service.yaml
  model-cache-pvc.yaml
  data-pvc.yaml
  configmap.yaml
  secret.yaml (mau)
  ingress.yaml
```

## 10. Cau Hinh Minikube De Xuat

### 10.1. Cau Hinh Co Ban

```text
Driver: docker (macOS/Linux)
CPU: 4-8 cores
RAM: 8-16 GB
Disk: 50-100 GB
Container runtime: containerd
Addons: ingress, metrics-server, storage-provisioner
```

Khoi dong:

```bash
minikube start --cpus=6 --memory=12288 --disk-size=50g
minikube addons enable ingress
minikube addons enable metrics-server
```

### 10.2. GPU Support (Neu Co GPU Local)

Neu may co GPU NVIDIA:

```bash
minikube start --cpus=6 --memory=12288 --disk-size=50g --gpus=all
kubectl apply -f https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/v0.17.0/deployments/static/nvidia-device-plugin.yml
```

Neu khong co GPU, chay CPU mode de test pipeline truoc.

### 10.3. Truy Cap App

```bash
minikube tunnel  # mo terminal rieng
# Frontend: http://localhost
# Backend API: http://localhost/api
# MinIO Console: http://localhost:9001
```

## 11. Bien Moi Truong

Can chuan bi:

```env
APP_ENV=development
STORAGE_BACKEND=local  # local | minio | s3
S3_ENDPOINT=http://minio:9000
S3_BUCKET=object-removal-demo
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
DATABASE_URL=sqlite:///data/app.db
MODEL_DEVICE=cuda  # hoac cpu
SEGMENTATION_MODEL=sam3_or_sam2_large
INPAINTING_MODEL=brushnet_sdxl
MODEL_CACHE_DIR=/models
MAX_IMAGE_MB=20
MAX_LONG_EDGE=4096
```

## 12. Logging Va Debug

Moi job nen luu:

```text
image_id
mask_id
model_name
prompt
negative_prompt
seed
mask_area_ratio
crop_bbox
duration_segmentation_ms
duration_inpainting_ms
error_message
```

Debug artifacts nen luu rieng:

```text
original.png
mask_raw.png
mask_refined.png
crop_input.png
crop_mask.png
crop_output.png
result.png
```

Day giup tinh chinh mask va prompt nhanh hon.

## 13. Chat Luong Va Test Set

Nen co bo anh test gom:

```text
1. Nguoi tren pho.
2. Xe tren duong.
3. Do vat tren ban.
4. Vat the tren nen tuong.
5. Vat the tren co/cay.
6. Bong do ro.
7. Reflection tren mat kinh/nuoc.
8. Object lon chiem 20-40% anh.
9. Nhieu object gan nhau.
10. Anh do phan giai cao.
```

Tieu chi cham diem moi anh:

```text
Mask accuracy: 1-5
Boundary quality: 1-5
Background realism: 1-5
Lighting consistency: 1-5
Artifact level: 1-5
Overall demo quality: 1-5
```

## 14. Rui Ro Chinh

### Rui ro 1: Mask qua sat vat the

Giai phap:

```text
Mac dinh dilate mask.
Cho user expand mask.
Them brush edit.
```

### Rui ro 2: Diffusion hallucinate object moi

Giai phap:

```text
Negative prompt manh.
Dung LaMa prefill.
Giam guidance scale.
Retry voi seed khac.
```

### Rui ro 3: Khong du VRAM

Giai phap:

```text
Crop-based inpainting.
Dung fp16.
Enable xFormers/attention optimization neu phu hop.
Gioi han crop size.
Dung g5.xlarge 24GB VRAM.
```

### Rui ro 4: Demo cham

Giai phap:

```text
Hien progress state.
Cache SAM embedding.
Warm up model khi server start.
Giu model loaded trong memory.
```

## 15. Thu Tu Uu Tien Thuc Thi

Lam theo thu tu sau:

```text
1. Script local remove_object.py voi input image + box.
2. Mask refinement dung OpenCV/scikit-image.
3. Crop-based inpainting.
4. BrushNet-SDXL/PowerPaint-SDXL integration.
5. FastAPI endpoint.
6. Frontend upload + canvas + mask preview.
7. Before/after result UI.
8. Docker Compose.
9. MinIO storage + backend abstract storage layer.
10. Kubernetes manifest + minikube deploy.
```

Khong nen bat dau bang Kubernetes truoc. Can co pipeline local on dinh roi moi deploy.

## 16. Ket Luan Model Stack Cuoi Cung

Stack nen dung cho demo chat luong cao:

```text
Segmentation:
SAM 3 neu available, fallback SAM 2.1 Large/HQ-SAM

Object detection by text optional:
GroundingDINO hoac Florence-2

Mask refinement:
OpenCV morphology + feathering + manual brush edit

Inpainting:
BrushNet-SDXL hoac PowerPaint-SDXL la primary
Big-LaMa la prefill/fallback

Deployment:
Docker Compose (local dev) -> Kubernetes/minikube (production-like testing) -> AWS/EKS (future)
```

Day la lua chon phu hop nhat neu muc tieu la demo nho nhung ket qua phai dep va thuyet phuc.
