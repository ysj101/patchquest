// ユニットテストの前に、演習用の機械の配布物（.machine/）を用意する。元になるものが変わっていなければ作り直さない
import { ensureMachine } from '../../scripts/build-machine.mjs';

export default async function setup(): Promise<void> {
  await ensureMachine();
}
