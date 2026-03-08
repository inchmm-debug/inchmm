# Vplay — Hand Reactive Morph Wireframe

브라우저에서 실행되는 Three.js + MediaPipe Hands 기반 인터랙티브 비주얼 테스트 프로토타입입니다.

## 실행 방법

```bash
cd Vplay
npm install
npm run dev
```

브라우저에서 `http://localhost:4173` 열기 (Chrome 권장).

## 완전 자동 실행 (macOS + Chrome)

```bash
cd Vplay
./run-macos-chrome.sh
```

- 서버를 자동 기동하고, 준비 완료 후 Chrome으로 `http://127.0.0.1:4173`를 자동 오픈합니다.
- 종료는 터미널에서 `Ctrl+C`.
- 포트 변경: `PORT=5180 ./run-macos-chrome.sh`
- 브라우저 오픈 없이 서버만 테스트: `NO_OPEN=1 ./run-macos-chrome.sh`

## 제스처 설명

- **한 손 접근**: 국소 노드 왜곡 증가
- **양손 벌리기/모으기**: 확장/압축 에너지 증가
- **빠른 손 이동**: morph energy 상승
- 손을 떼면 감쇠 및 안정화

## 키보드 단축키

- `D`: 디버그 랜드마크 토글
- `R`: 초기 Cube 리셋
- `F`: 풀스크린
- `1~5`: Morph 상태 강제 전환
- `C`: 카메라 피드 미리보기 토글

## 기술 구성

- Vite + TypeScript
- Three.js WebGL 렌더링
- MediaPipe Hands (CDN runtime)
- 연속 삼각함수 기반 pseudo-noise float/organic motion
- spring-damper 노드 물리 + morph target 전이

## 상태 단계

1. Cube
2. Inflated
3. Radial
4. Polygonal
5. Organic

## 아키텍처 개요

- 노드는 `base / morphTarget / position / velocity / force` 상태를 가짐.
- 엣지는 BufferGeometry 라인으로 유지, 노드 위치 업데이트 시 즉시 반영.
- 손가락 끝(엄지~새끼) 좌표를 월드로 변환해 외력(자력장)으로 적용.
- morph energy를 기반으로 상태 전이하며 컷 전환 없이 점진 변형.

## 향후 확장 아이디어

- 손 속도 기반 선 두께/명암 변화
- 상태 전환 pulse 시각 효과 강화
- 캡처/녹화 모듈 분리
- 내부에 타이포/이미지 삽입 가능한 레이어 시스템
