import { startApp } from './ui/app';

const root = document.getElementById('app');
if (!root) throw new Error('#app が見つかりません');
void startApp(root);
