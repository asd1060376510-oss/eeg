<div align="center">

# Peisejia BCI & Gaze Interaction System
**配色家 —— 离散眼神与脑波意念控制系统**

*Go hands-free. Navigate with your gaze, confirm with your focus, cancel with relaxation.*

</div>

---

## 简介 (Introduction)

本项目是一个纯前端（Vanilla JS + HTML5 + CSS3）打造的**未来级无感交互系统**。通过结合 Google MediaPipe 的边缘计算面部特征点追踪，以及使用现代浏览器 Web Serial API 直接解析 NeuroSky (TGAM) 的底层二进制脑波数据，构建了一套无需背负任何臃肿中继软件的**轻量化意念浏览方案**。

我们致力于将复杂的脑机接口（BCI）与眼动追踪（Eye-Tracking）无缝集成到了一个暗黑赛博风格的 Web UI 中，实现了真正的“所看即所指，所想即所得”。

## 核心特性 (Features)

- **抛弃坐标回归，独创虹膜测算**
  - 使用前置摄像头测算单眼虹膜在眼眶内的比例偏置（Iris Ratio）。
  - 直接映射为 8 个离散 UI 材质卡片选择，极大降低传统坐标回归算法的神经质抖动。
- **极速三步眼动校准**
  - 用户只需分别看向屏幕：左边 → 中间 → 右边，仅需 3 秒内完成自适应校准。
- **零依赖的 Web Serial 脑波直连**
  - 取消对 *ThinkGear Connector* 等中继服务的依赖。
  - 直接调用 `navigator.serial` 读取本地串口，并在 JS 内存栈中进行 TGAM 协议（`[0xAA, 0xAA, PLEN, ...]`）封包解析及校验。
- **蓄力式意念交互机制**
  - **专注度 (Attention) > 70% 延时 1.5s** -> [触发确认/点击]
  - **放松度 (Meditation) > 70% 延时 1.5s** -> [触发取消/退回]
- **精雕细琢的 Cyber UI 体验**
  - 动态呼吸卡片、动态脑波 HUD 数据仪、眼神追踪光标缓动（Lerp）与 CSS3 滤镜效果的完美结合。

## 架构与技术栈 (Tech Stack)

- **UI Rendering:** HTML5, Vanilla JavaScript (ES6+), CSS3
- **Vision Model:** [MediaPipe FaceLandmarker](https://developers.google.com/mediapipe/solutions/vision/face_landmarker) (WASM/GPU Delegate)
- **Hardware Integration:** [Web Serial API](https://wicg.github.io/serial/) (Native Comms)
- **Development Tooling:** Local HTTP server (e.g., `npx http-server`, `python http.server`)

## 快速启动 (Quick Start)

### 环境要求 (Prerequisites)
1. 带有摄像头的电脑（用于眼神追踪）。
2. 配戴支持 NeuroSky TGAM 芯片的脑波头盔（如 MindWave 等），并通过蓝牙或 USB 收发器连接到电脑。
3. **安全上下文**：由于调用硬件权限，必须运行在 `http://127.0.0.1` 或是安全的 `HTTPS` 环境。
4. **支持 Web Serial 的浏览器**：推荐使用最新版 **Google Chrome** 或 **Microsoft Edge**。

### 安装与运行 (Installation)

```bash
# 1. 克隆代码库
git clone https://github.com/asd1060376510-oss/eeg.git
cd eeg

# 2. 启动本地静态服务器 (Node.js 环境)
npx http-server -c-1
# 或使用 Python 环境
python -m http.server 8000
```
启动后在 Chrome 浏览器中访问 `http://127.0.0.1:8080/`。

## 使用指南 (Usage)

1. **授权摄像头**：首次运行请允许浏览器调用摄像头，等待“模型就绪”变为“可校准”状态。
2. **三步校准**：点击 `快速校准` 按钮，眼睛随屏幕中心白点转动。
3. **连接脑波设备**：
    - 点击左上角 **【连接脑波】** 按钮。
    - 浏览器将弹窗请求串口权限，选择对应的 `COM` 串口（波特率已默认硬编码为 `57600`）。
    - *请务必提前确保官方的 ThinkGear Connector 此刻已关闭，避免串口被独占锁定。*
4. **开始交互**：
    - **看**：移动你的眼球，你会发现页面卡片 and 眼神光标会随之选中。
    - **想**：凝神集气，目标卡片将被渐渐充电变蓝，充满后完成点击；深呼吸放松自己，界面便闪烁变红并重置取消。

## 开发与定制 (Customization)

本系统采用模块化脚本设计：
- `gaze-engine.js`: 囊括所有 MediaPipe 视觉推理、融合算法以及 DOM 光标更新逻辑。
- `brainwave-engine.js`: 独立处理串口连接状态机、TGAM 二进制数据处理以及 CustomEvent (`bw-confirm-start`, `bw-confirm-trigger`) 全局广播分发。
- 自定义触发参数：可以在 `brainwave-engine.js` 头部轻松改写：
  ```javascript
  const BW_CONFIG = {
      BAUD_RATE: 57600,      // 默认波特率
      THRESHOLD: 70,         // 意念触发门槛 (0-100)
      CHARGE_TIME: 1500      // 门槛需持续的时间(毫秒)
  };
  ```

## 参与贡献 (Contributing)

发现 bug？有更好的优化点子？欢迎通过提交 Issues 和 PRs 来帮助完善项目！

1. Fork 本仓库 
2. 新建特性分支 (git checkout -b feature/AmazingFeature)
3. 提交你的更改 (git commit -m 'Add some AmazingFeature')
4. 推送到分支 (git push origin feature/AmazingFeature)
5. 发起 Pull Request

## 许可 (License)

Distributed under the MIT License. See LICENSE for more information.

---
<div align="center">
  <sub>Built combining Artificial Intelligence and Brain-Computer Interfaces.</sub>
</div>
