# Image Crop (이미지 크롭: 자동 여백 제거 + 수동 정밀 크롭)

외부 불필요한 여백을 자동으로 잘라주는 **Auto Crop**과, 원하는 영역을 자유롭게 미세 조절하는 **Manual Crop** 2단계 파이프라인을 거쳐 고화질 이미지로 내보내는 정밀 크롭 도구입니다.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> 사전 인터뷰(Phase 1)를 통해 확정된 결정 사항과 기본 동작 방식입니다.

- **Confirmed Decision 1: Auto Crop 여백 감지 알고리즘**
  - 이미지 4개 모서리(좌상, 우상, 좌하, 우하)의 픽셀 RGBA 색상 및 알파 채널을 자동 샘플링합니다.
  - 모서리 배경색과 투명도를 기준으로 상/하/좌/우 바운딩 박스를 고속 픽셀 스캔하여 내용물 외곽 경계를 1차 자동 감지합니다.
- **Confirmed Decision 2: Manual Crop 조작 방식**
  - Auto Crop으로 감지된 크롭 박스 위에 직관적인 **8방향 리사이즈 핸들(상, 하, 좌, 우, 모서리 4개)**과 중앙 이동 드래그 인터페이스를 제공합니다.
  - 마우스 드래그 및 모바일 터치 제스처를 완벽 지원하며, 크롭 외곽 영역은 어두운 딤(Dimmed) 처리로 시각적 집중도를 극대화합니다.
- **Confirmed Decision 3: 처리 범위 및 워크플로우**
  - **단일 이미지 2단계 정밀 처리**: 이미지 업로드 ➔ [1단계] Auto Crop 경계 즉시 감지 ➔ [2단계] 수동 조절 ➔ 실시간 크기(W x H) 확인 및 다운로드.
  - 언제든 "오토크롭 초기화", "전체 선택", "100% 원본 보기"로 원클릭 복귀할 수 있습니다.
- **Confirmed Decision 4: 내보내기 포맷**
  - 원본 포맷 유지를 기본으로 하되, **PNG(투명 배경 보존)**, **JPEG**, **WebP**를 자유롭게 선택할 수 있으며, 다운로드 및 **클립보드 복사**를 지원합니다.
- **Confirmed Decision 5: 메뉴 배치**
  - 사용자의 요청에 따라 상단 탭 및 모바일 하단 네비게이션의 **첫 번째 메뉴(1순위)**로 배치됩니다:
    `[Image Crop]` ➔ `[PDF to Image]` ➔ `[Image Merge]` ➔ `[Excel Merge]` ➔ `[Music Timer]`

---

## 1. Overview & Core Concept

- **What It Does**:
  웹 디자이너, 문서 작성자, 기획자, 개발자가 캡처 도구나 스크린샷에서 발생하는 불필요한 흰색/단색/투명 외부 여백을 단 한 번의 클릭(또는 업로드 즉시)으로 자동 제거하고, 캔버스 핸들로 필요한 부분만 픽셀 단위로 잘라내어 저장할 수 있는 고성능 클라이언트 사이드 도구입니다.
- **Target Audience / Persona**:
  - 스크린샷이나 로고, 그래픽의 바깥 여백을 빠르게 정리해야 하는 실무자
  - 서버로 이미지를 업로드하지 않고 브라우저 내부에서 안전하고 즉각적인 이미지 편집을 원하는 사용자
- **Key Value**:
  - 100% 브라우저 메모리(HTML5 Canvas) 연산으로 데이터 유출 위험 제로
  - 무거운 그래픽 툴(포토샵 등) 설치 없이 웹에서 3초 만에 완결되는 초경량 2단계 크롭

---

## 2. User Experience & Visual Design

```
┌────────────────────────────────────────────────────────────────────────┐
│                              OmniTools                                 │
│  [✂️ Image Crop] [📄 PDF to Image] [🖼️ Image Merge] [📊 Excel Merge] ...│
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌──────────────────────────────────┐  ┌─────────────────────────────┐ │
│  │ 🖼️ 인터랙티브 크롭 뷰포트        │  │ ⚙️ 2단계 컨트롤 사이드바    │ │
│  │                                  │  │                             │ │
│  │    ┌────────────────────────┐    │  │ 1단계: Auto Crop             │ │
│  │ 딤 │ ┌───[ 8방향 핸들 ]───┐ │ 딤 │  │  • 여백 감지 감도: [  30  ] │ │
│  │ 처 │ │                    │ │ 처 │  │  • [⚡ 자동 여백 자르기]    │ │
│  │ 리 │ │   선택된 본문 영역 │ │ 리 │  │                             │ │
│  │    │ │                    │ │    │  │ 2단계: Manual Crop          │ │
│  │    │ └───[ 540 × 380px ]──┘ │    │  │  • X/Y/W/H 픽셀 수치 표시   │ │
│  │    └────────────────────────┘    │  │  • [↺ 원본으로] [⚡ 자동]    │ │
│  │                                  │  │                             │ │
│  │   [🔍 줌 조절] [↔ 화면 맞춤]     │  │ 3단계: 내보내기             │ │
│  │                                  │  │  • 포맷: [PNG / JPG / WEBP] │ │
│  │                                  │  │  • [💾 크롭 이미지 다운로드]│ │
│  └──────────────────────────────────┘  └─────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

### Key User Flows

1. **이미지 입력 (Zero State)**:
   - 드래그 앤 드롭 또는 파일 선택기, 클립보드 이미지 붙여넣기(`Ctrl+V`) 지원
2. **1단계 Auto Crop (자동 여백 감지)**:
   - 이미지가 로드되는 즉시 캔버스 픽셀 버퍼를 분석하여 4개 모서리 배경색을 식별
   - 여백 오차 허용치(Tolerance, 기본값 15~20)를 기반으로 상/하/좌/우 유의미한 콘텐츠 바운딩 박스를 자동 계산
   - 자동 감지된 바운딩 박스를 캔버스에 즉시 파란색 그리드와 함께 하이라이트 표시
3. **2단계 Manual Crop (수동 미세 조절)**:
   - 8개 리사이즈 핸들(좌상, 상, 우상, 우, 우하, 하, 좌하, 좌)을 드래그하여 원하는 영역 확장/축소
   - 박스 내부를 드래그하여 크롭 위치 자유 이동
   - 실시간으로 가로(W) × 세로(H) 픽셀 및 원본 대비 크롭 비율(%) 표시
4. **내보내기 (Export)**:
   - 단일 원클릭 "크롭 이미지 다운로드"
   - 원클릭 "클립보드 복사 (`navigator.clipboard.write`)"
   - 포맷(PNG, JPEG, WebP) 및 JPEG/WebP 품질 슬라이더

### Responsive Layout Strategy (Mobile & Desktop)

- **Desktop (md 이상)**: 좌측 대형 크롭 인터랙티브 캔버스 뷰포트 + 우측 정밀 컨트롤 패널(2열 스택)
- **Mobile (md 미만)**:
  - 상단: 터치 친화적 캔버스 인터랙션 영역 (핀치 줌 및 터치 핸들 크기 $\ge 44\text{px}$)
  - 하단: 오토크롭 버튼 및 포맷/다운로드 액션 바
  - 하단 앱 네비게이션의 1번 아이콘(`[자르기]`)으로 즉시 접근

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: 모서리 픽셀 색상 기반 알고리즘 vs 단순 흰색 감지**
  - *선택*: 4개 코너(Top-Left, Top-Right, Bottom-Left, Bottom-Right)의 RGBA 색상을 가중 평균하여 배경색을 추정하는 알고리즘 채택
  - *이유*: 일반 스크린샷은 흰색뿐 아니라 다크 모드(검정/짙은 회색) 또는 특정 단색 배경이 많음. 또한 알파가 0인 완전 투명 여백도 자연스럽게 감지됨.
  - *사용자 제어*: 여백 감도(Tolerance) 슬라이더를 제공하여 아주 미세한 그라디언트나 압축 노이즈가 있는 여백도 깨끗이 잘라낼 수 있음.
- **Decision 2: SVG/HTML 오버레이 기반 핸들 vs 순수 캔버스 렌더링**
  - *선택*: 이미지 렌더링 캔버스 위에 반응형 SVG/DOM 크롭 박스 및 포인터 이벤트 핸들을 중첩하는 하이브리드 아키텍처
  - *이유*: CSS 하드웨어 가속, 부드러운 드래그, 모바일 터치 이벤트(`pointerdown`, `pointermove`, `pointerup`) 처리의 정밀도 및 접근성이 순수 Canvas 다시 그리기보다 월등히 뛰어남.
- **Decision 3: 단일 파일 오프라인 번들 호환성 유지**
  - *선택*: 외부 무거운 크롭 라이브러리(cropperjs 등) 의존성을 추가하지 않고 경량화된 네이티브 React Canvas 유틸로 구현
  - *이유*: 기존 `OmniTools_Offline.html` 단일 파일 번들 크기(1.2MB대)를 유지하며, 네트워크 의존 없이 100% 브라우저 내부에서 즉각 구동 보장.

---

## 4. Technical Architecture & Data Strategy

### System Component Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                           App.tsx                            │
│  activeTab: 'crop' | 'pdf' | 'merge' | 'excel' | 'music'     │
└──────────────┬───────────────────────────────────────────────┘
               │ (activeTab === 'crop')
               ▼
┌──────────────────────────────────────────────────────────────┐
│                    ImageCropView.tsx                         │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ State:                                                 │  │
│  │  - imageFile, imageElement, naturalWidth, naturalHeight│  │
│  │  - cropRect: { x, y, width, height }                   │  │
│  │  - autoCropRect: { x, y, width, height }               │  │
│  │  - tolerance (0~100)                                   │  │
│  │  - exportFormat ('png' | 'jpeg' | 'webp')              │  │
│  │  - exportQuality (0.1 ~ 1.0)                           │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────┐  ┌──────────────────────────┐ │
│  │ CropCanvasViewport.tsx    │  │ CropControlsPanel.tsx    │ │
│  │ - HTML5 Image Viewer      │  │ - Auto Crop Trigger      │ │
│  │ - Dimmed Mask Overlay     │  │ - Tolerance Slider       │ │
│  │ - 8-Way Resize Handles    │  │ - Reset to Full / Auto   │ │
│  │ - Pointer / Touch Drag    │  │ - Export Format Selector │ │
│  │                           │  │ - Download & Copy Button │ │
│  └───────────────────────────┘  └──────────────────────────┘ │
└──────────────┬───────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│                   utils/imageCropper.ts                      │
│  - detectAutoCropBounds(img, tolerance): BoundingBox         │
│  - cropAndExportImage(img, cropRect, format, quality): Blob  │
└──────────────────────────────────────────────────────────────┘
```

### Data Structures & Types

```typescript
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AutoCropOptions {
  tolerance: number; // 0 to 100 (color difference threshold)
  sampleCornerSize: number; // e.g. 5px
}

export type ExportFormat = 'png' | 'jpeg' | 'webp';
```

---

## Plan Approval

계획 승인 후 아래 순서로 무결점 구현이 진행됩니다:
1. `src/utils/imageCropper.ts` 알고리즘 엔진 구현 (모서리 색상 감지, 알파 감지, 바운딩 박스 탐색, 고해상도 캔버스 크롭)
2. `src/components/ImageCropView.tsx` 2단계 크롭 UI 구현 (8방향 리사이즈 핸들, 딤 마스크, 줌/패닝, 포맷 변환 및 복사/다운로드)
3. `src/App.tsx` 최상단 1번째 메뉴 배치 및 모바일 네비게이션 탭 동기화
4. 오프라인 단일 파일(`OmniTools_Offline.html`) 및 `docs/index.html` 최신 빌드 동기화 검증
