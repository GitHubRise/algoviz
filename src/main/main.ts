import './styles.css';
import { createApp } from './app';

const root = document.getElementById('app');
if (!root) throw new Error('缺少 #app 挂载点');

createApp(root);
