const root = document.getElementById('app');
if (!root) throw new Error('#app が見つかりません');

const title = document.createElement('h1');
title.textContent = 'PatchQuest';
const lead = document.createElement('p');
lead.textContent = '学習用に脆弱性を注入した架空サービスで、事故の調査・再現・対策を体験します。';
root.replaceChildren(title, lead);
