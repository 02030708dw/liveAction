// src/stores/viaAuth.ts
import { defineStore } from 'pinia';
import {
    STEP_ORDER,
    STEP_LABEL,
    type StepKey,
    type StepState,
    type ViaFlowState,
} from '@/types/via/flow';
import { apiLogin } from '@/api/via';
import type { ViaPlayerLoginData } from '@/types/via/api';

function createInitialSteps(): Record<StepKey, StepState> {
    const result = {} as Record<StepKey, StepState>;
    STEP_ORDER.forEach((key) => {
        result[key] = {
            name: STEP_LABEL[key],
            loading: false,
            success: null,
            error: null,
            response: null,
        };
    });
    return result;
}

export const useViaAuthStore = defineStore('viaAuth', {
    state: (): ViaFlowState & { loginData: ViaPlayerLoginData | null } => ({
        running: false,
        currentStepIndex: -1,
        steps: createInitialSteps(),
        logs: [],
        platformToken: '',
        headerAuthToken: '',
        loginData: null,
    }),

    actions: {
        setTokens(platformToken: string, headerAuthToken?: string) {
            this.platformToken = platformToken;
            this.headerAuthToken = headerAuthToken || '';
        },

        log(msg: string) {
            const time = new Date().toLocaleTimeString();
            this.logs.unshift(`[${time}] ${msg}`);
        },

        reset() {
            this.running = false;
            this.currentStepIndex = -1;
            this.steps = createInitialSteps();
            this.logs = [];
            this.loginData = null;
        },

        async runStep(key: StepKey): Promise<boolean> {
            const step = this.steps[key];
            step.loading = true;
            step.error = null;
            step.success = null;
            this.log(`开始：${step.name}`);

            try {
                let res: any;

                switch (key) {
                    case 'step01Login': {
                        const data = await apiLogin(
                            this.platformToken,
                            this.headerAuthToken || undefined,
                        );
                        this.loginData = data;
                        res = data;
                        break;
                    }

                    // TODO: 其他步骤在这里继续加 case，调用各自的 apiXX
                }

                step.response = res;
                step.success = true;
                step.loading = false;
                this.log(`✅ 成功：${step.name}`);
                return true;
            } catch (err: any) {
                const msg = err?.message || '未知错误';
                step.success = false;
                step.loading = false;
                step.error = msg;
                this.log(`❌ 失败：${step.name}，错误：${msg}`);
                return false;
            }
        },

        async runAll() {
            if (this.running) return;
            this.running = true;
            this.currentStepIndex = -1;
            this.logs = [];

            for (let i = 0; i < STEP_ORDER.length; i++) {
                const key = STEP_ORDER[i];
                this.currentStepIndex = i;
                const ok = await this.runStep(key as StepKey);
                if (!ok) {
                    this.running = false;
                    this.log(`流程中止，在步骤：${this.steps[key as StepKey].name}`);
                    return;
                }
            }

            this.running = false;
            this.log('🎉 全部 17 步执行完成');
        },
    },
});
