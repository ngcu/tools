# OmniTools: Image Edit Studio, File to Image (Office 지원) & Offline HTML 다운로드

---

## User Review & Critical Decisions

> [!IMPORTANT]
> 사전 인터뷰(Phase 1)를 통해 확정된 세부 결정 사항입니다.

- **Confirmed Decision 1: Offline HTML 다운로드 버튼**
  - 상단 헤더 우측 상태 뱃지 옆에 눈에 띄는 **`Offline HTML 다운로드`** 액션 버튼을 신설합니다.
  - 클릭 시 서버 통신 없이 현재 브라우저 메모리에 준비된 최신 단일 오프라인 배포 파일(`OmniTools_Offline.html`)이 즉시 컴퓨터/모바일 다운로드 폴더로 저장됩니다.
- **Confirmed Decision 2: Image Edit 좌측 도구 팔레트**
  - 메뉴 명칭을 **`Image Edit (이미지 편집)`**으로 승격하고 좌측에 수직 도구 팔레트(Toolbar Palette)를 구축합니다.
  - 지원 도구 9종:
    1. **Crop (자르기)**: 1단계 모서리 감지 Auto Crop + 2단계 8방향 핸들 Manual Crop
    2. **Resize (크기 조정)**: 가로/세로 px 입력, 비율 잠금, 25%/50%/75%/200% 프리셋
    3. **Canvas Size (캔버스 확장)**: 패딩 추가, 9방향 기준 앵커, 배경색(투명/흰색/검정/컬러)
    4. **Sharpen (선명도 강화)**: 확대 시 선명도를 복원하는 컨볼루션 언샵 마스크(Unsharp Mask)
    5. **Mosaic & Blur (특정 영역 마스킹)**: 영역 드래그 지정, 모자이크 타일 크기 및 블러 반경 정밀 슬라이더
    6. **Rotate & Flip (회전/반전)**: 90도 회전, 좌우 반전, 상하 반전
    7. **Color Adjust (색상 보정)**: 밝기(Brightness), 대비(Contrast), 채도(Saturation) 슬라이더
    8. **Border & Radius (테두리/곡률)**: 둥근 모서리(Border Radius) 및 테두리 선(Border Stroke)
    9. **Text & Watermark (텍스트/워터마크)**: 글자 입력, 폰트 크기, 글자색, 투명도 오버레이
- **Confirmed Decision 3: File to Image (PDF + DOCX + PPTX) 확장**
  - 메뉴 명칭을 **`File to Image`**로 변경하고, 파일 확장자(.pdf, .docx, .pptx)를 자동 인식합니다.
  - **PDF**: 기존의 초고속 `pdfjs-dist` 벡터 렌더링 유지 (DPI 72/150/300/600 선택)
  - **DOCX**: 브라우저 클라이언트 사이드 XML 파서 기반으로 텍스트, 테이블, 헤딩 서식을 감지하여 페이지별 고화질 캔버스로 변환
  - **PPTX**: 슬라이드 XML 구조(ZIP)를 언팩하여 각 슬라이드별 레이아웃과 텍스트/이미지를 추출하여 슬라이드별 이미지로 변환
  - 변환된 모든 페이지/슬라이드는 일괄 ZIP 압축 다운로드 및 개별 이미지 저장을 동일하게 지원

---

## 1. Overview & Core Concept

1. **상단 Offline 다운로더**: 사용자가 웹 버전을 쓰다가 언제든 인터넷 없는 환경에서도 쓸 수 있도록 단일 오프라인 파일을 즉시 다운로드 제공.
2. **올인원 이미지 에디터**: 단순 크롭을 넘어 리사이징, 캔버스 패딩, 모자이크 마스킹, 선명도 향상, 텍스트 워터마크까지 웹 브라우저 안에서 100% 프라이빗하게 처리.
3. **만능 문서 ➔ 이미지 변환기**: PDF뿐 아니라 직장/학교에서 가장 많이 다루는 워드(DOCX)와 파워포인트(PPTX)를 프로그램 설치 없이 브라우저에서 바로 고화질 이미지(PNG/JPG)로 변환.

---

## 2. User Experience & Visual Design

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  OmniTools      [Image Edit] [File to Image] [Image Merge] ...  [💾 Offline HTML]│
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌───────┐ ┌───────────────────────────────────────┐ ┌──────────────────────┐ │
│ │팔레트 │ │          중앙 작업 뷰포트             │ │ 우측 세부 조절 패널  │ │
│ │ ✂️ 자르기│ │                                       │ │                      │ │
│ │ 📐 크기│ │   ┌───────────────────────────────┐   │ │ 선택된 도구 옵션     │ │
│ │ 🖼️ 캔버스│ │   │                               │   │ │                      │ │
│ │ ✨ 선명도│ │   │     작업 이미지 캔버스        │   │ │ [슬라이더 / 수치입력]│ │
│ │ ▦ 모자이크│ │   │   (영역 선택 / 핸들 조작)     │   │ │                      │ │
│ │ 🔄 회전│ │   │                               │   │ │ ──────────────────── │ │
│ │ 🎨 보정│ │   └───────────────────────────────┘   │ │ [💾 결과 다운로드]  │ │
│ │ 🔲 테두리│ │                                       │ │ [📋 클립보드 복사]  │ │
│ │ ✍️ 텍스트│ │  [🔍 맞춤] [1:1 보기] [↺ 변경 취소]    │ │                      │ │
│ └───────┘ └───────────────────────────────────────┘ └──────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Key User Flows

1. **Offline HTML 다운로드 플로우**:
   - 사용자가 헤더 우측의 `Offline HTML 다운로드` 버튼 클릭
   - 최신 빌드된 단일 HTML 파일(`OmniTools_Offline.html`)이 즉시 브라우저 다운로드로 트리거
   - "오프라인 파일 다운로드 완료! 인터넷 없이 더블클릭하여 바로 사용하실 수 있습니다." 안내 토스트 제공

2. **Image Edit 플로우**:
   - 이미지 업로드 또는 `Ctrl+V` 붙여넣기
   - 좌측 툴바에서 원하는 도구(자르기, 크기 조정, 모자이크, 선명도 등) 선택
   - 우측 패널에서 슬라이더나 수치 조절 시 캔버스에 실시간 반영
   - 언제든 `되돌리기(Undo)` / `초기화(Reset)` 가능
   - 최종 결과물 PNG/JPG/WebP 다운로드 또는 클립보드 복사

3. **File to Image 플로우**:
   - PDF, DOCX, PPTX 파일을 드래그 앤 드롭
   - 파일 확장자를 감지하여 파일 뱃지 및 메타데이터(총 페이지 수/슬라이드 수) 표시
   - 해상도(DPI) 설정 후 "이미지로 변환" 클릭 ➔ 진행 상태 바 표시
   - 변환 완료 후 갤러리 뷰에서 선택된 슬라이드들을 개별 또는 ZIP으로 다운로드

---

## 3. Technical Architecture & Component Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                               App.tsx                                  │
│  - Header: Download Offline Button (triggers OmniTools_Offline.html)   │
│  - Tabs: 'edit' | 'file-to-image' | 'merge' | 'excel' | 'music'        │
└───────────────┬────────────────────────────────────────┬───────────────┘
                │ (activeTab === 'edit')                 │ (activeTab === 'file-to-image')
                ▼                                        ▼
┌──────────────────────────────────────┐ ┌───────────────────────────────┐
│          ImageEditView.tsx           │ │       FileToImageView.tsx     │
│  - Left: ToolPalette (9 tools)       │ │  - Format Sniffer:            │
│  - Center: Interactive Canvas Canvas │ │    * PDF: pdfjsLib (vector)   │
│  - Right: Tool Settings & Export Bar │ │    * DOCX: docxParser/Canvas  │
│  - Engine: utils/imageStudio.ts      │ │    * PPTX: pptxParser/Canvas  │
│    (Crop, Resize, CanvasSize, Blur,  │ │  - Batch Downloader & ZIP     │
│     Mosaic, Sharpen, Filters, Text)  │ └───────────────────────────────┘
└──────────────────────────────────────┘
```

### Data Structures & Utility Engine (`src/utils/imageStudio.ts`)

- `applySharpenKernel(imageData, strength)`: 3x3 라플라시안/언샵 컨볼루션 필터로 경계선 선명도 복원
- `applyMosaicFilter(ctx, rect, tileSize)`: 지정 사각형 영역의 픽셀을 다운샘플링/타일 블록화
- `applyBlurFilter(ctx, rect, radius)`: 지정 사각형 영역 가우시안/박스 블러 처리
- `applyColorAdjustments(canvas, brightness, contrast, saturation)`: CSS filter 및 픽셀 연산 합성
- `applyTextWatermark(canvas, text, options)`: 캔버스 위에 고화질 텍스트 오버레이 렌더링
- `applyCanvasPadding(canvas, padding, bgOption, anchor)`: 9방향 기준 캔버스 여백 확장

---

## Plan Approval

계획 승인 시 아래 단계로 구현 및 검증이 진행됩니다:
1. 상단 헤더에 `Offline HTML 다운로드` 원클릭 버튼 배치 및 다운로드 핸들러 구현
2. `src/utils/imageStudio.ts` 엔진 작성 (선명도, 모자이크, 리사이징, 캔버스 패딩, 회전, 필터, 텍스트)
3. `src/components/ImageEditView.tsx` 구현 (좌측 9개 툴바 팔레트 + 인터랙티브 캔버스 + 우측 컨트롤)
4. `src/components/FileToImageView.tsx` 구현 (PDF + DOCX + PPTX 지원)
5. `src/App.tsx` 탭 명칭(`Image Edit`, `File to Image`) 및 모바일 네비게이션 연동
6. 컴파일 검증 및 최신 `OmniTools_Offline.html`, `docs/index.html` 단일 파일 빌드 동기화
