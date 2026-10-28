const pptxgen = require('pptxgenjs');
const path = require('path');

const SCR = path.join(__dirname, 'screens');
const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';
pres.title = 'BPMSoft AI Agent';
pres.author = 'bpmsoft-agent';
pres.theme = { headFontFace: 'Arial', bodyFontFace: 'Calibri' };

// App palette (apps/desktop styles.css)
const BG = 'FAFAFA', WHITE = 'FFFFFF', MUTEDBG = 'F4F4F5', INK = '18181B', TEXT = '3F3F46', MUTED = '71717A';
const BORDER = 'E4E4E7', ACCENT = '4F46E5', ACCENT_L = 'EEF2FF', ACCENT_B = 'C7D2FE';
const WARN = 'D97706', WARN_L = 'FFFBEB', WARN_B = 'FDE68A';

pres.defineSlideMaster({
  title: 'CONTENT',
  background: { color: BG },
  objects: [
    { text: { text: 'BPMSoft AI Agent', options: { x: 0.6, y: 6.95, w: 4, h: 0.35, fontSize: 10, color: MUTED, fontFace: 'Calibri', margin: 0 } } },
    { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.35, w: 12.1, h: 0.85, fontSize: 32, bold: true, color: INK, fontFace: 'Arial', valign: 'middle', align: 'left', margin: 0 }, text: '' } }
  ],
  slideNumber: { x: 12.2, y: 6.95, w: 0.5, h: 0.35, fontSize: 10, color: MUTED, align: 'right' }
});
pres.defineSlideMaster({ title: 'BLANK', background: { color: BG }, objects: [] });
pres.defineSlideMaster({ title: 'ACCENT', background: { color: ACCENT }, objects: [] });

function content(section, title) {
  const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: section });
  s.addText(title, { placeholder: 'title' });
  return s;
}
function txt(s, text, o) {
  s.addText(text, Object.assign({ isTextBox: true, fontFace: 'Calibri', fontSize: 14, color: TEXT, margin: 0, valign: 'top' }, o));
}
function box(s, x, y, w, h, fill, line) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: fill }, line: { color: line || fill, width: 1 }, rectRadius: 0.08 });
}
function num(s, x, y, d, label, fill, color) {
  const f = fill || ACCENT;
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: f }, line: { color: f } });
  s.addText(String(label), { isTextBox: true, x, y, w: d, h: d, align: 'center', valign: 'middle', fontFace: 'Arial', bold: true, fontSize: Math.round(d * 26), color: color || WHITE, margin: 0 });
}
function bullets(items, space) {
  return items.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < items.length - 1, paraSpaceAfter: space || 6 } }));
}
function card(s, x, y, w, h, n, head, body, fill, line) {
  box(s, x, y, w, h, fill || WHITE, line || BORDER);
  let hx = x + 0.25;
  if (n !== null) { num(s, x + 0.25, y + 0.25, 0.5, n); hx = x + 0.9; }
  txt(s, head, { x: hx, y: y + 0.25, w: x + w - 0.2 - hx, h: 0.5, fontFace: 'Arial', bold: true, fontSize: 16, color: INK, valign: 'middle' });
  txt(s, Array.isArray(body) ? bullets(body, 8) : body, { x: x + 0.25, y: y + 0.95, w: w - 0.5, h: h - 1.15 });
}
function rowCard(s, x, y, w, h, n, head, body) {
  box(s, x, y, w, h, WHITE, BORDER);
  num(s, x + 0.2, y + 0.2, 0.45, n);
  txt(s, head, { x: x + 0.8, y: y + 0.17, w: w - 1.0, h: 0.5, valign: 'middle', fontFace: 'Arial', bold: true, fontSize: 16, color: INK });
  txt(s, body, { x: x + 0.8, y: y + 0.68, w: w - 1.0, h: h - 0.78 });
}
function miniCard(s, x, y, w, h, head, items, fill, line) {
  box(s, x, y, w, h, fill || WHITE, line || BORDER);
  txt(s, head, { x: x + 0.25, y: y + 0.15, w: w - 0.5, h: 0.4, valign: 'middle', fontFace: 'Arial', bold: true, fontSize: 16, color: INK });
  txt(s, bullets(items, 4), { x: x + 0.25, y: y + 0.62, w: w - 0.5, h: h - 0.72 });
}
function arrow(s, x1, y1, x2, y2, color) {
  s.addShape(pres.shapes.LINE, { x: x1, y: y1, w: x2 - x1, h: y2 - y1, line: { color: color || ACCENT, width: 2, endArrowType: 'triangle' } });
}
function shot(s, file, x, y, w, h) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: WHITE }, line: { color: BORDER, width: 1 }, rectRadius: 0.06, shadow: { type: 'outer', color: '000000', opacity: 0.10, blur: 10, offset: 3, angle: 90 } });
  s.addImage({ path: path.join(SCR, file), x: x + 0.04, y: y + 0.04, w: w - 0.08, h: h - 0.08 });
}

// 1. Title
pres.addSection({ title: 'Введение' });
let s = pres.addSlide({ masterName: 'BLANK', sectionTitle: 'Введение' });
s.addImage({ path: path.join(SCR, 'logo.png'), x: 0.8, y: 1.7, w: 0.9, h: 0.9 });
txt(s, 'BPMSoft AI Agent', { x: 0.8, y: 2.85, w: 5.4, h: 0.9, fontFace: 'Arial', bold: true, fontSize: 40, color: INK, valign: 'middle' });
txt(s, 'ИИ-разработчик для проектов на BPMSoft: от задачи до проверенной реализации на стенде', { x: 0.8, y: 3.9, w: 5.2, h: 1.1, fontSize: 18, color: MUTED });
txt(s, 'Как пользоваться, что умеет и как устроен · октябрь 2026', { x: 0.8, y: 5.15, w: 5.2, h: 0.4, fontSize: 14, color: ACCENT, bold: true });
shot(s, 'empty.png', 6.4, 1.6, 6.3, 3.94);

// 2. What is it
s = content('Введение', 'Что такое BPMSoft AI Agent');
txt(s, bullets([
  'Desktop-приложение для macOS и Windows: чат, история чатов, логи',
  'Работает в папке приложения BPMSoft и пишет файлы пакетов в BPMSoft.Configuration/Pkg',
  'Если вы включили: сам обновляет и компилирует стенд, читает БД и смотрит интерфейс CRM',
  'Модель на выбор: Claude или Cursor — в «Настройках»',
  'Опирается на базу знаний о metadata BPMSoft, а не на догадки'
], 14), { x: 0.6, y: 1.5, w: 6.6, h: 4.9, fontSize: 18 });
[['27', 'файлов базы знаний о metadata BPMSoft'], ['12', 'скиллов для Claude Code — экспорт в стенд'], ['16', 'кейсов эвалов — автотестов поведения агента']].forEach(([n, l], i) => {
  const y = 1.45 + i * 1.7;
  if (i === 0) box(s, 7.7, y, 5.0, 1.5, ACCENT_L, ACCENT_B); else box(s, 7.7, y, 5.0, 1.5, WHITE, BORDER);
  txt(s, n, { x: 7.95, y, w: 1.7, h: 1.5, fontFace: 'Arial', bold: true, fontSize: 54, color: ACCENT, valign: 'middle' });
  txt(s, l, { x: 9.7, y, w: 2.8, h: 1.5, fontSize: 16, valign: 'middle' });
});

// 3. Getting started
pres.addSection({ title: 'Как пользоваться' });
s = content('Как пользоваться', 'С чего начать');
[
  ['Откройте проект', 'Папка стенда BPMSoft — приложение проверит компьютер и режим разработки в ФС'],
  ['Подключите модель', '«Настройки»: провайдер Claude или Cursor, ключ API, модель'],
  ['Включите доступы', 'По желанию: БД CRM, действия в CRM, встроенный браузер'],
  ['Опишите задачу', 'Обычным языком: что, где, для кого. Назовите пакет — или агент спросит'],
  ['Подтвердите план', 'Агент не пишет файлы до вашего «Делай»']
].forEach(([h, b], i) => {
  const y = 1.5 + i * 0.95;
  num(s, 0.6, y, 0.5, i + 1);
  txt(s, h, { x: 1.3, y: y - 0.02, w: 6.0, h: 0.38, fontFace: 'Arial', bold: true, fontSize: 16, color: INK, valign: 'middle' });
  txt(s, b, { x: 1.3, y: y + 0.38, w: 6.0, h: 0.5 });
});
txt(s, 'Остановить ответ — «Стоп» или Esc; прошлые чаты — в списке слева', { x: 0.6, y: 6.35, w: 7.0, h: 0.4, color: MUTED, italic: true });
shot(s, 'settings_provider.png', 8.2, 1.45, 3.93, 4.6);
txt(s, 'Настройки: провайдер, ключ и модель', { x: 8.2, y: 6.15, w: 3.93, h: 0.35, fontSize: 12, color: MUTED, align: 'center' });

// 3a. Requirements
s = content('Как пользоваться', 'Что нужно на компьютере');
txt(s, [{ text: 'Уже в установщике: ', options: { bold: true, color: INK } }, { text: 'Claude Code и Cursor SDK, ripgrep, клиент PostgreSQL, встроенный браузер CRM, pkg_lint' }], { x: 0.6, y: 1.4, w: 12.1, h: 0.45, valign: 'middle', fontSize: 15 });
const rh = (t) => ({ text: t, options: { bold: true, color: INK, fill: { color: MUTEDBG }, fontFace: 'Arial', fontSize: 14 } });
const rc = (t, o) => ({ text: t, options: Object.assign({ fontSize: 13, color: TEXT, fontFace: 'Calibri', fill: { color: WHITE } }, o) });
const rn = (t) => rc(t, { bold: true, color: INK });
const STOP = { color: 'DC2626', bold: true }, WARNC = { color: WARN, bold: true };
s.addTable([
  [rh('Что'), rh('Зачем'), rh('Если нет')],
  [rn('macOS 13+ или Windows 10 1809+ x64'), rc('Минимум для Claude Code и Cursor'), rc('Проект не откроется', STOP)],
  [rn('Стенд на этом компьютере, разработка в файловой системе'), rc('fileDesignMode и UseStaticFileContent=false: иначе «Обновить из файловой системы» не подхватит правки'), rc('Проект не откроется — приложение покажет, что поменять', STOP)],
  [rn('Node.js 18+ в PATH'), rc('Иерархия клиентских схем (hierarchy.js) и разовые скрипты'), rc('Предупреждение: клиентские схемы агент делает хуже', WARNC)],
  [rn('Git for Windows (только Windows)'), rc('Git Bash — через него идут команды агента'), rc('Cursor: проект не откроется. Claude: предупреждение, каждая команда — с подтверждением', WARNC)],
  [rn('git (по желанию)'), rc('git status и откат правок в Pkg'), rc('Предупреждение: агент пропустит эти шаги', WARNC)]
], { x: 0.6, y: 1.95, w: 12.1, colW: [3.4, 4.5, 4.2], rowH: [0.45, 0.6, 0.8, 0.6, 0.8, 0.55], border: { type: 'solid', pt: 0.75, color: BORDER }, valign: 'middle' });
box(s, 0.6, 5.95, 12.1, 0.85, ACCENT_L, ACCENT_B);
txt(s, 'Нужен ключ API Claude или Cursor. По желанию: доступ к PostgreSQL стенда (лучше пользователь только на чтение) и пользователь CRM с ролью «Системный администратор». macOS: сборка без нотаризации — при первом запуске правый клик → «Открыть»', { x: 0.85, y: 5.95, w: 11.6, h: 0.85, valign: 'middle' });

// 3b. Environment check
s = content('Как пользоваться', 'Приложение проверяет окружение само');
shot(s, 'header_env.png', 0.6, 1.4, 5.6, 0.54);
txt(s, 'Бейдж «Окружение» в шапке — пока чего-то не хватает; клик покажет, что именно', { x: 6.5, y: 1.4, w: 6.2, h: 0.54, valign: 'middle', fontSize: 15 });
shot(s, 'env_problem.png', 0.6, 2.25, 4.86, 3.6);
shot(s, 'fdm_card.png', 5.71, 2.25, 4.03, 3.6);
txt(s, bullets([
  'При запуске: ОС, Node.js, git, Git Bash',
  'Не откроет проект: старая ОС, нет разработки в ФС, Cursor на Windows без Git Bash',
  'Остальное — предупреждение с причиной и ссылкой «Скачать»'
], 10), { x: 10.0, y: 2.25, w: 2.7, h: 3.6 });
txt(s, 'Результат проверки — в environment.json в папке логов. После установки программы — «Проверить снова»', { x: 0.6, y: 6.1, w: 12.1, h: 0.45, color: MUTED, italic: true });

// 4. Workflow
s = content('Как пользоваться', 'Как агент ведёт задачу');
const flow4 = [
  ['Пакет', 'Спрашивает, в какой пакет писать, и не угадывает'],
  ['Требования', 'Все вопросы одним сообщением, варианты — кнопками'],
  ['Исследование', 'Знания, аналоги в пакетах, иерархия схем'],
  ['План и стоп', 'Критерии приёмки, файлы, риски — ждёт «Делай»'],
  ['Реализация', 'Пишет в Pkg, перечитывает, запускает pkg_lint'],
  ['Проверка', 'Обновляет стенд и проверяет критерии приёмки'],
  ['Наблюдения', 'Новое для базы знаний — в конце ответа']
];
const cw = 12.1 / 7;
s.addShape(pres.shapes.LINE, { x: 0.6 + cw / 2, y: 2.05, w: cw * 6, h: 0, line: { color: ACCENT_B, width: 2 } });
flow4.forEach(([h, b], i) => {
  const cx = 0.6 + cw * i;
  num(s, cx + cw / 2 - 0.4, 1.65, 0.8, i + 1, i === 3 ? WARN : ACCENT, WHITE);
  txt(s, h, { x: cx + 0.03, y: 2.65, w: cw - 0.06, h: 0.5, align: 'center', fontFace: 'Arial', bold: true, fontSize: 15, color: INK });
  txt(s, b, { x: cx + 0.1, y: 3.2, w: cw - 0.2, h: 1.8, align: 'center' });
});
box(s, 0.6, 5.35, 12.1, 1.15, ACCENT_L, ACCENT_B);
txt(s, 'Вопрос об устройстве проекта без правок — агент отвечает сразу: без пакета, плана и подтверждения. Исправление ошибки в только что сделанном по плану — тоже без нового плана.', { x: 0.9, y: 5.35, w: 11.5, h: 1.15, valign: 'middle', fontSize: 15 });

// 5. Plan (screenshots)
s = content('Как пользоваться', 'План, который можно проверить');
shot(s, 'plan.png', 0.6, 1.4, 5.95, 4.87);
shot(s, 'choices.png', 6.75, 1.4, 5.95, 4.87);
txt(s, [{ text: 'AC', options: { bold: true, color: ACCENT } }, { text: ' — что вы увидите, ' }, { text: 'CC', options: { bold: true, color: ACCENT } }, { text: ' — краевые случаи, ' }, { text: 'DoD', options: { bold: true, color: ACCENT } }, { text: ' — готовность' }], { x: 0.6, y: 6.4, w: 5.95, h: 0.45 });
txt(s, 'Файлы — только после «Делай»; ответы на вопросы — не подтверждение плана', { x: 6.75, y: 6.4, w: 5.95, h: 0.45 });

// 6. Features
pres.addSection({ title: 'Возможности' });
s = content('Возможности', 'Что умеет агент');
[
  ['Объекты', 'Колонки любых типов, индексы, замещения, события, удаление с проверкой ссылок'],
  ['Клиентские схемы', 'Карточки, разделы, детали, мини-карточки, модули: поля, кнопки, валидация, запросы ESQ'],
  ['Бизнес-процессы', 'Элементы, шлюзы, сигналы, таймеры, подпроцессы, свои действия процесса на C#'],
  ['C# и сервисы', 'Слушатели событий, REST-сервисы, вызов внешних API, уведомления пользователю'],
  ['Данные и права', 'Системные настройки, справочники, SQL-скрипты, права на операции, колонки и записи'],
  ['Регистрация', 'Разделы, карточки, детали, справочники, группы, рабочие места']
].forEach(([h, b], i) => card(s, 0.6 + (i % 3) * 4.1, 1.45 + Math.floor(i / 3) * 2.55, 3.9, 2.35, i + 1, h, b));
txt(s, 'А ещё: объясняет, как сейчас устроен проект, и разбирает ошибки стенда по журналам', { x: 0.6, y: 6.48, w: 12.1, h: 0.4, color: MUTED, italic: true });

// 7. Principles
pres.addSection({ title: 'Принципы' });
s = content('Принципы', 'Принципы разработки агента');
[
  ['Петля исправлений с контрольной точкой', 'Ошибки своих схем исправляет сам; после 5 неудач или 3 одинаковых ошибок подряд — спрашивает'],
  ['Сначала дешёвые проверки кодом', 'pkg_lint перед каждым обновлением стенда: при ошибке на стенд ничего не уходит'],
  ['Эвалы — тесты для агента', 'Типовые задачи прогоняются автоматически на тестовом стенде после изменений агента'],
  ['Каждая ошибка становится правилом', 'Закрываем на самом дешёвом уровне: код → знания → промпт → кейс эвалов'],
  ['Знания общие, наблюдения — со всех', 'Агент предлагает, разработчик переносит в знания только подтверждённое'],
  ['Человек в петле по степени риска', 'Чтение — сразу, запись — по плану, удаление и массовые правки — после вопроса'],
  ['Песочница и наблюдаемость', 'Читает только проект, пишет только в Pkg; каждый чат пишется в лог']
].forEach(([h, b], i) => {
  const col = i < 4 ? 0 : 1, row = i < 4 ? i : i - 4;
  const x = 0.6 + col * 6.25, y = 1.4 + row * 1.3;
  num(s, x, y + 0.05, 0.55, i + 1);
  txt(s, h, { x: x + 0.75, y, w: 5.1, h: 0.4, fontFace: 'Arial', bold: true, fontSize: 15, color: INK });
  txt(s, b, { x: x + 0.75, y: y + 0.42, w: 5.1, h: 0.8 });
});
box(s, 6.85, 5.3, 5.85, 1.25, ACCENT);
txt(s, [{ text: 'Главное правило: ', options: { bold: true, color: WARN_B } }, { text: 'не изобретать metadata. ✅-факты из знаний — напрямую, остальное — подтверждать файлами проекта', options: { color: WHITE } }], { x: 7.1, y: 5.3, w: 5.4, h: 1.25, valign: 'middle' });

// 8. Boundaries
s = content('Принципы', 'Границы: что агент делает сам, а что — нет');
[
  [ACCENT, ACCENT_L, ACCENT_B, '✓', 'Сам, без вопроса', ['Читает папку проекта и базу знаний', 'Пишет в выбранный пакет Pkg — по подтверждённому плану', 'Читает журналы стенда, git status и diff', 'Выполняет SELECT к БД CRM — если доступ включён', 'Перечитывает свои файлы и запускает pkg_lint']],
  [WARN, WARN_L, WARN_B, '!', 'Нельзя или только с вашего согласия', ['Читать ConnectionStrings.config, ключи и сертификаты', 'Менять Autogenerated, Resources и conf', 'Удалять схемы и данные, массово менять записи — после вопроса', 'Коммиты, ветки, push — решаете вы', 'Писать пароли и токены в файлы и повторять их в ответах']]
].forEach(([c, l, b, g, h, items], i) => {
  const x = 0.6 + i * 6.15;
  box(s, x, 1.45, 5.95, 4.75, l, b);
  num(s, x + 0.3, 1.7, 0.55, g, c, WHITE);
  txt(s, h, { x: x + 1.05, y: 1.7, w: 4.6, h: 0.55, valign: 'middle', fontFace: 'Arial', bold: true, fontSize: 18, color: INK });
  txt(s, bullets(items, 10), { x: x + 0.3, y: 2.5, w: 5.35, h: 3.5, fontSize: 15 });
});
txt(s, 'Внешние команды — в песочнице ОС или с вашего подтверждения; выход за границы проекта отклоняется автоматически', { x: 0.6, y: 6.4, w: 12.1, h: 0.45, color: MUTED, italic: true });

// 9a. Security: agent inside the file system
pres.addSection({ title: 'Безопасность' });
s = content('Безопасность', 'Агент в файловой системе: что его ограничивает');
[
  ['Пишет', 'Только Pkg выбранного проекта'],
  ['Читает', 'Папка приложения BPMSoft и база знаний'],
  ['Закрыто', 'Домашняя папка, ~/.ssh, ~/.aws, Keychain, ConnectionStrings.config, ключи и сертификаты']
].forEach(([h, b], i) => {
  const y = 1.45 + i * 1.4;
  if (i === 0) box(s, 0.6, y, 4.6, 1.25, ACCENT); else box(s, 0.6, y, 4.6, 1.25, i === 1 ? ACCENT_L : WARN_L, i === 1 ? ACCENT_B : WARN_B);
  txt(s, h, { x: 0.85, y: y + 0.12, w: 4.1, h: 0.35, fontFace: 'Arial', bold: true, fontSize: 15, color: i === 0 ? WHITE : INK });
  txt(s, b, { x: 0.85, y: y + 0.47, w: 4.1, h: 0.7, color: i === 0 ? WHITE : TEXT });
});
txt(s, 'Пароли БД и CRM агенту не передаются: инструменты подключаются сами, секреты хранятся в защищённом хранилище ОС', { x: 0.6, y: 5.7, w: 4.6, h: 0.95, color: MUTED, italic: true });
[
  ['Проверка каждого действия', 'До выполнения: чтение вне проекта и запись вне Pkg отклоняются, файлы с секретами не открываются'],
  ['Песочница ОС для команд', 'macOS: запись только в Pkg, без сети, домашняя папка закрыта. Windows: без вопроса — только чтение'],
  ['Подтверждение человека', 'Удаление, git, сеть и программы вроде curl, npm, python, psql — только с вашего разрешения'],
  ['БД — только чтение', 'SELECT в транзакции только для чтения; изменения, системные функции и колонки с паролями закрыты']
].forEach(([h, b], i) => rowCard(s, 5.5, 1.45 + i * 1.32, 7.2, 1.22, i + 1, h, b));

// 9b. Security: project code and the model
s = content('Безопасность', 'Код проекта и модель в интернете');
miniCard(s, 0.6, 1.45, 5.95, 2.35, 'Что уходит в модель', [
  'Системный промпт и нужные файлы базы знаний',
  'Фрагменты файлов, которые агент прочитал: схемы Pkg, код платформы',
  'Результаты запросов к БД — до 200 строк, без колонок с паролями',
  'Текст и снимки страниц CRM — если включён браузер'
]);
miniCard(s, 0.6, 3.95, 5.95, 1.9, 'Что не уходит', [
  'Пароли БД и CRM, ключи API — инструменты подключаются сами',
  'Файлы с секретами и всё, что вне папки проекта',
  'Служебная телеметрия Claude Code — отключена: наружу уходят только запросы к модели'
], ACCENT_L, ACCENT_B);
miniCard(s, 6.75, 1.45, 5.95, 2.0, 'Claude — API и корпоративные тарифы', [
  'По умолчанию данные не используются для обучения',
  'Удаляются в течение 30 дней; возможен договор нулевого хранения (ZDR)'
]);
miniCard(s, 6.75, 3.6, 5.95, 2.25, 'Cursor — с Privacy Mode', [
  'Cursor не обучается на данных, у провайдеров моделей — договоры нулевого хранения',
  'Запросы всегда идут через сервер Cursor, даже со своим ключом'
]);
box(s, 0.6, 6.0, 12.1, 0.8, ACCENT);
txt(s, [{ text: 'Предлагаем: ', options: { bold: true, color: WARN_B } }, { text: 'корпоративный договор с Claude (при необходимости ZDR) или Privacy Mode в Cursor; тестовые стенды без боевых персональных данных; отдельный пользователь БД только на чтение', options: { color: WHITE } }], { x: 0.85, y: 6.0, w: 11.6, h: 0.8, valign: 'middle' });
s.addNotes('Источники (проверено 22.10.2026): privacy.claude.com — «Is my data used for model training?» и «How long do you store my organization\'s data?»; cursor.com/data-use — Privacy Mode и маршрутизация запросов через сервер Cursor.');

// 9. Indicators (real header and badges)
pres.addSection({ title: 'Стенд CRM и БД' });
s = content('Стенд CRM и БД', 'Индикаторы в шапке приложения');
box(s, 0.6, 1.45, 12.1, 0.8, BG, BORDER);
s.addImage({ path: path.join(SCR, 'header_left.png'), x: 0.75, y: 1.6, w: 5.0, h: 0.5 });
s.addImage({ path: path.join(SCR, 'header_right.png'), x: 9.26, y: 1.6, w: 3.29, h: 0.5 });
[
  ['badge_off.png', 'Доступ выключен в настройках — или для CRM не заданы адрес, пользователь и пароль'],
  ['badge_checking.png', 'Идёт проверка подключения: при включении и при каждой смене настроек'],
  ['badge_ok.png', 'Подключение есть. Наведите — подробности, клик — проверить снова'],
  ['badge_error.png', 'Нет подключения. Наведите — причина, клик — проверить снова']
].forEach(([f, d], i) => {
  const y = 2.8 + i * 0.8;
  s.addImage({ path: path.join(SCR, f), x: 0.6, y, w: 1.94, h: 0.42 });
  txt(s, d, { x: 2.9, y, w: 9.8, h: 0.42, valign: 'middle', fontSize: 15 });
});
box(s, 0.6, 6.0, 12.1, 0.8, WHITE, BORDER);
txt(s, 'Оранжевый бейдж «Окружение» — на компьютере чего-то не хватает, клик покажет что. Точка у «Настроек» — не задан ключ API. Глобус — браузер CRM, «Логи» — лог сессии', { x: 0.85, y: 6.0, w: 11.6, h: 0.8, valign: 'middle' });

// 10. CRM
s = content('Стенд CRM и БД', 'Работа со стендом CRM');
shot(s, 'actions.png', 0.6, 1.45, 5.6, 4.585);
[
  ['Действия в CRM', 'Обновляет из файловой системы (сначала pkg_lint), компилирует и перезапускает — после вашего ответа'],
  ['Браузер CRM', 'Открывает страницы CRM в панели справа: текст, консоль, сеть, снимок — и проверяет критерии приёмки'],
  ['REST-запросы', 'Свои сервисы, данные с правами пользователя, запуск процесса. Изменения — только с согласия, на тестовых записях']
].forEach(([h, b], i) => rowCard(s, 6.6, 1.45 + i * 1.55, 6.1, 1.5, i + 1, h, b));
box(s, 0.6, 6.2, 12.1, 0.6, WARN_L, WARN_B);
txt(s, '«Спрашивать перед каждым действием» — агент показывает действие и ждёт разрешения. Клики в браузере подтверждаются всегда', { x: 0.85, y: 6.2, w: 11.6, h: 0.6, valign: 'middle' });

// 11. Browser
s = content('Стенд CRM и БД', 'Встроенный браузер CRM');
shot(s, 'browser.png', 0.6, 1.45, 7.9, 4.96);
txt(s, bullets([
  'CRM открывается в панели справа под учётной записью из настроек — вы видите ту же страницу',
  'Агент читает текст страницы, консоль и сеть; снимок — когда важна вёрстка',
  'В ответе цитирует увиденное и отмечает, какие AC подтверждены',
  'Только смотрит: не сохраняет и не удаляет записи; клики — с разрешения'
], 12), { x: 8.85, y: 1.5, w: 3.85, h: 4.9, fontSize: 15 });

// 12. Fix loop
s = content('Стенд CRM и БД', 'Петля исправлений');
['Запись в Pkg', 'pkg_lint', 'Обновление из ФС', 'Компиляция', 'Проверка'].forEach((t, i) => {
  const x = 0.6 + i * 2.5, last = i === 4;
  if (last) box(s, x, 1.6, 2.1, 0.9, ACCENT); else box(s, x, 1.6, 2.1, 0.9, ACCENT_L, ACCENT_B);
  txt(s, t, { x, y: 1.6, w: 2.1, h: 0.9, align: 'center', valign: 'middle', fontFace: 'Arial', bold: true, fontSize: 15, color: last ? WHITE : INK });
  if (!last) arrow(s, x + 2.12, 2.05, x + 2.48, 2.05);
});
[
  [ACCENT_L, ACCENT_B, ACCENT, 'Ошибка в своей схеме', 'Агент исправляет сам и повторяет обновление и компиляцию — без нового плана. Инструмент сообщает номер попытки'],
  [WARN_L, WARN_B, WARN, 'Контрольная точка', '5 неудачных попыток или 3 одинаковые ошибки подряд: агент пишет, что пробовал, и спрашивает — «Продолжай исправлять» или «Остановись, разберусь сам»'],
  [WHITE, BORDER, ACCENT, 'Ошибка вне плана', 'Схема, которую в этом чате не меняли, или нужна правка вне плана — агент не правит молча, а спрашивает']
].forEach(([f, l, c, h, b], i) => {
  const y = 2.95 + i * 1.25;
  box(s, 0.6, y, 12.1, 1.1, f, l);
  num(s, 0.85, y + 0.25, 0.6, i + 1, c, WHITE);
  txt(s, h, { x: 1.7, y: y + 0.1, w: 2.9, h: 0.9, valign: 'middle', fontFace: 'Arial', bold: true, fontSize: 16, color: INK });
  txt(s, b, { x: 4.7, y: y + 0.1, w: 7.8, h: 0.9, valign: 'middle' });
});

// 13. DB
s = content('Стенд CRM и БД', 'Доступ к БД CRM — только чтение');
txt(s, 'Как устроено', { x: 0.6, y: 1.45, w: 3.9, h: 0.5, fontFace: 'Arial', bold: true, fontSize: 18, color: INK });
txt(s, bullets([
  'Один SELECT или WITH к PostgreSQL, транзакция только для чтения, до 200 строк',
  'Изменяющие запросы отклоняет проверка безопасности',
  'Учётные данные — из настроек, пароль в защищённом хранилище ОС; ConnectionStrings.config агент не читает',
  '«Спрашивать перед каждым запросом» — покажет SQL и подождёт'
], 10), { x: 0.6, y: 2.05, w: 3.9, h: 4.6 });
txt(s, 'Зачем агенту БД', { x: 4.75, y: 1.45, w: 3.75, h: 0.5, fontFace: 'Arial', bold: true, fontSize: 18, color: INK });
txt(s, bullets([
  'Id рабочих мест и записей базовых справочников',
  'Текущие значения системных настроек',
  'Проверка после обновления: появились ли записи, выполнился ли SQL-скрипт'
], 10), { x: 4.75, y: 2.05, w: 3.75, h: 3.2 });
box(s, 4.75, 5.4, 3.75, 1.2, ACCENT_L, ACCENT_B);
txt(s, 'Данные меняются только через файлы Pkg: данные пакета и SQL-скрипты', { x: 4.95, y: 5.4, w: 3.35, h: 1.2, valign: 'middle' });
shot(s, 'settings_dbsec.png', 8.88, 1.45, 3.83, 4.85);

// 14. Fallbacks
s = content('Стенд CRM и БД', 'Если доступ выключен — агент не застревает');
const hdr = (t) => ({ text: t, options: { bold: true, color: INK, fill: { color: MUTEDBG }, fontFace: 'Arial', fontSize: 15 } });
const cell = (t, o) => ({ text: t, options: Object.assign({ fontSize: 14, color: TEXT, fontFace: 'Calibri' }, o) });
const name = (t, i) => cell(t, { bold: true, color: INK, fill: { color: i % 2 ? BG : WHITE } });
const c2 = (t, i) => cell(t, { fill: { color: i % 2 ? BG : WHITE } });
s.addTable([
  [hdr('Возможность'), hdr('Включена'), hdr('Выключена или недоступна')],
  [name('БД CRM', 0), c2('Сам выполняет SELECT и проверяет результат', 0), c2('Читает данные REST-запросом (DataService), если включены действия в CRM; иначе даёт вам готовый SQL', 0)],
  [name('Действия в CRM', 1), c2('Сам обновляет из файловой системы и компилирует', 1), c2('Просит вас нажать «Обновить из файловой системы» и скомпилировать', 1)],
  [name('Браузер CRM', 2), c2('Сам открывает страницу и проверяет критерии приёмки', 2), c2('Даёт шаги проверки по каждому AC — проверяете вы', 2)],
  [name('REST-запросы', 3), c2('Проверяет сервисы, процессы и права глазами пользователя', 3), c2('Просит выполнить запрос или проверить в интерфейсе', 3)]
], { x: 0.6, y: 1.45, w: 12.1, colW: [2.4, 4.2, 5.5], rowH: [0.55, 0.95, 0.85, 0.85, 0.85], border: { type: 'solid', pt: 0.75, color: BORDER }, valign: 'middle' });
box(s, 0.6, 5.85, 12.1, 0.9, ACCENT_L, ACCENT_B);
txt(s, 'Ответ «CRM недоступна» или «вход не выполнен» — агент не повторяет вызов впустую: переходит на запасной путь и говорит, что сделать вам', { x: 0.9, y: 5.85, w: 11.5, h: 0.9, valign: 'middle', fontSize: 15 });

// 15. Claude Code export
pres.addSection({ title: 'Claude Code' });
s = content('Claude Code', 'Экспорт скиллов в Claude Code');
[
  'Настройки → «Claude Code» → «Установить скиллы в проект»',
  'В стенд ставится .claude: CLAUDE.md, 12 скиллов bpm-*, база знаний, pkg-lint.js и MCP-сервер bpmsoft',
  'Свой CLAUDE.md уже есть — подключить отдельным файлом или заменить',
  'Файлы, изменённые вручную, — предупредит перед перезаписью',
  'После обновления приложения — кнопка «Обновить скиллы»'
].forEach((t, i) => {
  const y = 1.5 + i * 0.78;
  num(s, 0.6, y, 0.5, i + 1);
  txt(s, t, { x: 1.3, y: y - 0.06, w: 6.4, h: 0.62, valign: 'middle', fontSize: 15 });
});
shot(s, 'settings_claude.png', 8.3, 1.45, 4.4, 3.575);
['bpm-develop', 'bpm-explain', 'bpm-entity', 'bpm-client-schemas', 'bpm-process', 'bpm-user-task', 'bpm-source-code', 'bpm-web-service', 'bpm-data', 'bpm-sql-script', 'bpm-registration', 'bpm-troubleshoot'].forEach((t, i) => {
  const x = 0.6 + (i % 6) * 2.02, y = 5.45 + Math.floor(i / 6) * 0.47;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 1.95, h: 0.38, fill: { color: ACCENT_L }, line: { color: ACCENT_B, width: 1 }, rectRadius: 0.19 });
  txt(s, t, { x, y, w: 1.95, h: 0.38, align: 'center', valign: 'middle', fontSize: 12, bold: true, color: ACCENT });
});
txt(s, 'Те же правила и знания — в Claude Code. Данные CRM читает MCP-сервер bpmsoft; запрос к БД — через crm_db_query, если доступ включён, иначе SQL агент отдаёт вам', { x: 0.6, y: 6.42, w: 12.1, h: 0.45, color: MUTED, italic: true });

// 16. Logs and observations
pres.addSection({ title: 'Логи и знания' });
s = content('Логи и знания', 'Логи и наблюдения: агент становится умнее');
[
  ['Ваш чат', 'Агент решает задачу и узнаёт новое о проекте'],
  ['Наблюдения', 'Блок в конце ответа: факт, источник, статус'],
  ['knowledge-notes.md', 'Приложение собирает блоки автоматически'],
  ['Проверка', 'Разработчик сверяет с логом и стендом'],
  ['Знания ✅', 'Обновление получают все пользователи']
].forEach(([h, b], i) => {
  const x = 0.6 + i * 2.5, last = i === 4;
  if (last) box(s, x, 1.45, 2.15, 1.95, ACCENT); else box(s, x, 1.45, 2.15, 1.95, WHITE, BORDER);
  txt(s, h, { x: x + 0.15, y: 1.6, w: 1.85, h: 0.6, fontFace: 'Arial', bold: true, fontSize: 14, color: last ? WHITE : INK });
  txt(s, b, { x: x + 0.15, y: 2.25, w: 1.85, h: 1.05, color: last ? WHITE : TEXT });
  if (!last) arrow(s, x + 2.17, 2.42, x + 2.48, 2.42);
});
txt(s, 'Так выглядит блок в ответе агента', { x: 0.6, y: 3.7, w: 6.0, h: 0.35, fontSize: 13, bold: true, color: MUTED });
shot(s, 'notes_block.png', 0.6, 4.1, 6.0, 1.09);
txt(s, 'Приложение само собирает такие блоки в knowledge-notes.md рядом с логами чатов', { x: 0.6, y: 5.4, w: 6.0, h: 0.6, color: MUTED, italic: true });
miniCard(s, 6.85, 3.7, 5.85, 1.5, 'Лог каждого чата', [
  'Действия, ошибки, токены и стоимость — по каждому чату',
  'macOS: ~/Library/Logs/bpmsoft-agent; Windows: папка данных приложения\\logs'
]);
miniCard(s, 6.85, 5.3, 5.85, 1.5, 'Почему знания не пишутся сами', [
  'Иначе знания у пользователей разойдутся',
  'В знания попадает только подтверждённое; опровергнутое помечается явно'
], ACCENT_L, ACCENT_B);

// 17. Error becomes a rule
s = content('Логи и знания', 'Каждая ошибка становится правилом');
[
  ['Проверка в коде', 'pkg_lint и проверки инструментов — одинаково для всех, не зависит от модели'],
  ['Запись в знаниях', 'Рецепт или факт с пометкой ✅ — подтверждено записью в CRM'],
  ['Правило в промпте', 'Порядок работы, который модель соблюдает всегда'],
  ['Кейс эвалов', 'Автотест, чтобы ошибка не вернулась незаметно']
].forEach(([h, b], i) => {
  const x = 0.6 + i * 1.0, y = 1.5 + i * 1.15, w = 8.0, first = i === 0;
  if (first) box(s, x, y, w, 0.95, ACCENT); else if (i === 3) box(s, x, y, w, 0.95, WARN_L, WARN_B); else box(s, x, y, w, 0.95, ACCENT_L, ACCENT_B);
  txt(s, h, { x: x + 0.3, y, w: 2.6, h: 0.95, valign: 'middle', fontFace: 'Arial', bold: true, fontSize: 16, color: first ? WHITE : INK });
  txt(s, b, { x: x + 3.0, y, w: w - 3.2, h: 0.95, valign: 'middle', color: first ? WHITE : TEXT });
});
box(s, 9.9, 1.5, 2.8, 1.95, WHITE, BORDER);
txt(s, '16', { x: 10.15, y: 1.55, w: 2.3, h: 0.8, fontFace: 'Arial', bold: true, fontSize: 44, color: ACCENT, valign: 'middle' });
txt(s, 'кейсов эвалов: раннер ведёт диалог как пользователь и проверяет результат', { x: 10.15, y: 2.35, w: 2.4, h: 1.0, fontSize: 12 });
txt(s, 'Сверху вниз — от самого дешёвого и надёжного уровня к самому дорогому', { x: 0.6, y: 6.2, w: 12.1, h: 0.45, color: MUTED, italic: true });

// 18. Tips
pres.addSection({ title: 'Итог' });
s = pres.addSlide({ masterName: 'ACCENT', sectionTitle: 'Итог' });
txt(s, 'Как получить лучший результат', { x: 0.8, y: 0.6, w: 11.7, h: 0.9, fontFace: 'Arial', bold: true, fontSize: 36, color: WHITE, valign: 'middle' });
[
  'Называйте пакет и раздел — агенту не придётся гадать',
  'Отвечайте на вопросы по требованиям: от них зависит точность плана',
  'Читайте план: критерии приёмки — это то, что вы будете проверять',
  'Включите БД и CRM на тестовом стенде — агент проверит работу сам',
  'Прислали ошибку или скриншот — агент прочитает журналы и исправит',
  'Заметили ошибку агента — расскажите разработчику: она станет правилом'
].forEach((t, i) => {
  const x = 0.8 + (i % 2) * 6.1, y = 1.9 + Math.floor(i / 2) * 1.55;
  num(s, x, y, 0.6, i + 1, WHITE, ACCENT);
  txt(s, t, { x: x + 0.85, y: y - 0.05, w: 5.0, h: 1.2, fontSize: 17, color: WHITE });
});

// 19. Access survey
s = content('Итог', 'Доступ к Claude или Cursor для разработчиков');
box(s, 0.6, 1.45, 12.1, 0.9, WHITE, BORDER);
txt(s, 'Агенту нужна модель — подписка Claude или Cursor. Подписка есть не у всех, поэтому компания рассматривает два варианта', { x: 0.9, y: 1.45, w: 11.5, h: 0.9, valign: 'middle', fontSize: 16 });
card(s, 0.6, 2.6, 5.95, 2.35, 1, 'Корпоративный Claude + токен', 'Компания подключает корпоративный Claude и выдаёт разработчику токен — он вводится в «Настройках» приложения');
card(s, 6.75, 2.6, 5.95, 2.35, 2, 'Компенсация подписки', 'Разработчик сам оформляет подписку Claude или Cursor, компания компенсирует её стоимость');
box(s, 0.6, 5.2, 12.1, 1.55, ACCENT);
txt(s, [
  { text: 'Чтобы выбрать вариант, собираем список желающих', options: { bold: true, fontSize: 18, breakLine: true } },
  { text: 'Ответьте: нужен ли вам доступ · есть ли уже подписка (Claude, Cursor, нет) · какой вариант удобнее', options: { fontSize: 15, breakLine: true } },
  { text: 'Куда ответить: ____________   Срок: ____________', options: { fontSize: 15, color: WARN_B } }
], { x: 0.9, y: 5.2, w: 11.5, h: 1.55, valign: 'middle', color: WHITE });

pres.writeFile({ fileName: path.join(__dirname, 'bpmsoft-agent.pptx') }).then((f) => console.log('written', f));
