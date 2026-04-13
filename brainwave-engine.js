/**
 * 配色家脑波交互引擎 (Web Serial API 原生直连方案)
 * 映射: 专注 (Attention) -> 确认
 *       放松 (Meditation) -> 取消
 */

const BW_CONFIG = {
    BAUD_RATE: 57600,      // TGAM 默认波特率
    THRESHOLD: 70,         // 触发百分比
    CHARGE_TIME: 1500,     // 触发所需持续时间 (ms)
};

class TGAMParser {
    constructor(onData) {
        this.onData = onData;
        this.buffer = [];
        this.state = 'WAIT_SYNC_1';
        this.payloadLength = 0;
        this.payload = [];
    }

    // 状态机处理输入的字节流
    processBuffer(data) {
        for (let i = 0; i < data.length; i++) {
            const byte = data[i];

            switch (this.state) {
                case 'WAIT_SYNC_1':
                    if (byte === 0xAA) this.state = 'WAIT_SYNC_2';
                    break;
                case 'WAIT_SYNC_2':
                    if (byte === 0xAA) {
                        this.state = 'WAIT_LENGTH';
                    } else {
                        this.state = 'WAIT_SYNC_1';
                    }
                    break;
                case 'WAIT_LENGTH':
                    if (byte > 169) {
                        this.state = 'WAIT_SYNC_1';
                    } else {
                        this.payloadLength = byte;
                        this.payload = [];
                        this.state = 'WAIT_PAYLOAD';
                    }
                    break;
                case 'WAIT_PAYLOAD':
                    this.payload.push(byte);
                    if (this.payload.length === this.payloadLength) {
                        this.state = 'WAIT_CHKSUM';
                    }
                    break;
                case 'WAIT_CHKSUM':
                    const checksum = byte;
                    let sum = 0;
                    for (let j = 0; j < this.payload.length; j++) {
                        sum += this.payload[j];
                    }
                    sum &= 0xFF; // 取低8位
                    sum = (~sum) & 0xFF; // 取反并只保留8位

                    if (sum === checksum) {
                        this.parsePayload(this.payload);
                    } else {
                        console.warn("TGAM Checksum Error");
                    }
                    this.state = 'WAIT_SYNC_1';
                    break;
            }
        }
    }

    parsePayload(payload) {
        let i = 0;
        let parsedData = {};

        while (i < payload.length) {
            let excode = 0;
            while (payload[i] === 0x55) {
                excode++;
                i++;
            }
            if (i >= payload.length) break;

            const code = payload[i++];
            let vlength = 1;
            
            if (code >= 0x80) {
                vlength = payload[i++];
            }

            const valueBytes = payload.slice(i, i + vlength);
            i += vlength;

            if (excode === 0) {
                if (code === 0x02) parsedData.poorSignal = valueBytes[0];
                if (code === 0x04) parsedData.attention = valueBytes[0];
                if (code === 0x05) parsedData.meditation = valueBytes[0];
                // 可以按需添加对其他参数(如EEG能量)的解析
            }
        }

        if (Object.keys(parsedData).length > 0) {
            this.onData(parsedData);
        }
    }
}

class BrainwaveEngine {
    constructor() {
        this.port = null;
        this.reader = null;
        this.isConnected = false;
        
        this.focus = 0;
        this.relax = 0;

        // 蓄力计时器
        this.confirmTimer = null;
        this.cancelTimer = null;
        this.isConfirming = false;
        this.isCancelling = false;

        // DOM 元素
        this.els = {
            connectBtn: document.getElementById('bw-connect-btn'),
            status: document.getElementById('bw-status'),
            focusBar: document.getElementById('bw-focus-bar'),
            relaxBar: document.getElementById('bw-relax-bar'),
            focusVal: document.getElementById('bw-focus-val'),
            relaxVal: document.getElementById('bw-relax-val')
        };

        this.parser = new TGAMParser(this.handleParsedData.bind(this));

        // 检查浏览器是否支持 Web Serial
        if ("serial" in navigator) {
            this.els.connectBtn.addEventListener('click', () => this.connect());
        } else {
            this.els.connectBtn.textContent = "浏览器不支持";
            this.els.connectBtn.disabled = true;
            this.els.status.textContent = "请使用 Chrome/Edge";
        }
    }

    async connect() {
        try {
            // 请求用户选择串口
            this.port = await navigator.serial.requestPort();
            await this.port.open({ baudRate: BW_CONFIG.BAUD_RATE });

            this.isConnected = true;
            this.els.status.textContent = "已连接设备";
            this.els.status.className = "bw-value connected";
            this.els.connectBtn.style.display = "none"; // 隐藏按钮

            // 开始持续读取数据
            this.readLoop();

            // 监听串口断开事件
            this.port.addEventListener('disconnect', () => {
                this.disconnect();
            });

        } catch (e) {
            console.error("连接失败或用户取消:", e);
        }
    }

    async readLoop() {
        while (this.port.readable && this.isConnected) {
            this.reader = this.port.readable.getReader();
            try {
                while (true) {
                    const { value, done } = await this.reader.read();
                    if (done) {
                        break;
                    }
                    if (value) {
                        this.parser.processBuffer(value);
                    }
                }
            } catch (error) {
                console.error("读取错误:", error);
            } finally {
                this.reader.releaseLock();
            }
        }
    }

    disconnect() {
        this.isConnected = false;
        this.els.status.textContent = "设备断开";
        this.els.status.className = "bw-value disconnected";
        this.els.connectBtn.style.display = "block";
        this.els.connectBtn.textContent = "重新连接";
        
        // 重置状态
        this.updateStates(0, 0);
        this.stopChargingConfirm();
        this.stopChargingCancel();
    }

    handleParsedData(data) {
        // poorSignal=200 代表头盔脱落或无信号，此时数据无效，应丢弃
        if (data.poorSignal === 200) {
            this.els.status.textContent = "信号丢失";
            this.els.status.className = "bw-value disconnected";
            return;
        }

        // 信号恢复时更新状态文案
        if (data.poorSignal !== undefined && data.poorSignal < 200) {
            this.els.status.textContent = data.poorSignal === 0 ? "信号优秀" : "信号一般(" + data.poorSignal + ")";
            this.els.status.className = "bw-value connected";
        }

        let att = this.focus;
        let med = this.relax;
        
        if (data.attention !== undefined) att = data.attention;
        if (data.meditation !== undefined) med = data.meditation;
        
        this.updateStates(att, med);
    }

    updateStates(attention, meditation) {
        // 注意：TGAM 通常每秒只发送 1 次 attention 和 meditation
        // 为了视觉平滑，实际生产中可以增加插值算法，此处为最原始数据
        this.focus = attention;
        this.relax = meditation;

        // 更新 UI
        if (this.els.focusBar) this.els.focusBar.style.width = this.focus + "%";
        if (this.els.relaxBar) this.els.relaxBar.style.width = this.relax + "%";
        if (this.els.focusVal) this.els.focusVal.textContent = this.focus;
        if (this.els.relaxVal) this.els.relaxVal.textContent = this.relax;

        this.processLogic();
    }

    processLogic() {
        // 互斥逻辑：专注和放松不能同时触发，优先级给"确认"
        const focusActive = this.focus >= BW_CONFIG.THRESHOLD;
        const relaxActive = this.relax >= BW_CONFIG.THRESHOLD;

        // --- 专注 → 确认 (优先) ---
        if (focusActive) {
            this.stopChargingCancel(); // 打断取消
            if (!this.confirmTimer) {
                this.startChargingConfirm();
            }
        } else {
            this.stopChargingConfirm();
        }

        // --- 放松 → 取消 (仅在专注度低于门槛时才生效) ---
        if (relaxActive && !focusActive) {
            if (!this.cancelTimer) {
                this.startChargingCancel();
            }
        } else if (!relaxActive) {
            this.stopChargingCancel();
        }
    }

    startChargingConfirm() {
        console.log("正在确认...");
        this.isConfirming = true;
        document.body.classList.add('bw-charging-confirm');
        
        window.dispatchEvent(new CustomEvent('bw-confirm-start'));

        this.confirmTimer = setTimeout(() => {
            this.triggerConfirm();
        }, BW_CONFIG.CHARGE_TIME);
    }

    stopChargingConfirm() {
        if (this.confirmTimer) {
            clearTimeout(this.confirmTimer);
            this.confirmTimer = null;
        }
        if (this.isConfirming) {
            this.isConfirming = false;
            document.body.classList.remove('bw-charging-confirm');
            window.dispatchEvent(new CustomEvent('bw-confirm-stop'));
        }
    }

    triggerConfirm() {
        console.log("确认已触发!");
        this.stopChargingConfirm();
        window.dispatchEvent(new CustomEvent('bw-confirm-trigger'));
        
        const activeCard = document.querySelector('.gaze-card.gazed');
        if (activeCard) {
            activeCard.classList.add('confirmed-pulse');
            setTimeout(() => activeCard.classList.remove('confirmed-pulse'), 1000);
        }
    }

    startChargingCancel() {
        console.log("正在取消...");
        this.isCancelling = true;
        document.body.classList.add('bw-charging-cancel');
        window.dispatchEvent(new CustomEvent('bw-cancel-start'));

        this.cancelTimer = setTimeout(() => {
            this.triggerCancel();
        }, BW_CONFIG.CHARGE_TIME);
    }

    stopChargingCancel() {
        if (this.cancelTimer) {
            clearTimeout(this.cancelTimer);
            this.cancelTimer = null;
        }
        if (this.isCancelling) {
            this.isCancelling = false;
            document.body.classList.remove('bw-charging-cancel');
            window.dispatchEvent(new CustomEvent('bw-cancel-stop'));
        }
    }

    triggerCancel() {
        console.log("取消/重置已触发!");
        this.stopChargingCancel();
        window.dispatchEvent(new CustomEvent('bw-cancel-trigger'));
        
        document.body.style.filter = "grayscale(1) brightness(0.5)";
        setTimeout(() => document.body.style.filter = "", 500);
    }
}

// 初始化引擎
window.brainwaveEngine = new BrainwaveEngine();
