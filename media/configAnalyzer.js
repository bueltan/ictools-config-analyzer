/* global acquireVsCodeApi */

const vscode = acquireVsCodeApi();

// DOM refs
const pickFolderBtn = document.getElementById('pick-folder');
const folderPathEl = document.getElementById('folder-path');
const statusEl = document.getElementById('status');

const runAllReposBtn = document.getElementById('run-all-repos');
const sourceReposBody = document.getElementById('source-repos-body');

const runAllPipConfigsBtn = document.getElementById('run-all-pip-configs');
const pipConfigsBody = document.getElementById('pip-configs-body');

const packagesSection = document.getElementById('packages-section');
const packagesTitle = document.getElementById('packages-title');
const packagesBody = document.getElementById('packages-body');

// State
let sourceRepos = [];         // [{ name, git_url, git_ref, status?, severity?, lastTimestamp? }]
let pipConfigs = [];          // [{ ...PiPConfigInfo, overallStatus?, lastTimestamp? }]
let selectedPipConfig = null; // PiPConfigInfo | null
let currentPackages = [];     // PackageInfo[] for selected config

function decorateStatus(status) {
    if (!status || status === 'Not validated') {
        return '⏺️ Not validated';
    }
    if (status.startsWith('OK')) {
        return '✅ ' + status;
    }
    if (status.startsWith('missing')) {
        return '❌ ' + status;
    }
    if (status.startsWith('access error')) {
        return '❌ ' + status;
    }
    return '⚠️ ' + status;
}

function decorateOverallStatus(overallStatus) {
    if (!overallStatus || overallStatus === 'Not validated') {
        return '⏺️ Not validated';
    }
    if (overallStatus === 'All OK') {
        return '✅ All OK';
    }
    if (overallStatus === 'Issues found') {
        return '❌ Issues found';
    }
    return overallStatus;
}

// ---------- Source Code table ----------

function renderSourceRepos() {
    sourceReposBody.innerHTML = '';

    sourceRepos.forEach((repo, index) => {
        const tr = document.createElement('tr');

        const tdIndex = document.createElement('td');
        tdIndex.textContent = String(index + 1);
        tr.appendChild(tdIndex);

        const tdName = document.createElement('td');
        tdName.textContent = repo.name || '';
        tr.appendChild(tdName);

        const tdUrl = document.createElement('td');
        tdUrl.textContent = repo.git_url || '';
        tr.appendChild(tdUrl);

        const tdRef = document.createElement('td');
        tdRef.textContent = repo.git_ref || '';
        tr.appendChild(tdRef);

        const tdStatus = document.createElement('td');
        if (repo.isRunning) {
            tdStatus.textContent = '⏳ Validating...';
        } else {
            tdStatus.textContent = decorateStatus(repo.status || 'Not validated');
        }
        tr.appendChild(tdStatus);

        const tdLast = document.createElement('td');
        if (repo.lastTimestamp) {
            const d = new Date(repo.lastTimestamp);
            tdLast.textContent = d.toLocaleString();
        } else {
            tdLast.textContent = '';
        }
        tr.appendChild(tdLast);

        const tdAction = document.createElement('td');
        const btn = document.createElement('button');
        btn.textContent = 'Run';
        btn.addEventListener('click', () => {
            // mark only this repo as running
            sourceRepos = sourceRepos.map(r => r.name === repo.name
                ? { ...r, isRunning: true, status: 'Validating...' }
                : r
            );
            renderSourceRepos();

            vscode.postMessage({
                type: 'runSingleRepo',
                payload: { name: repo.name }
            });
        });
        tdAction.appendChild(btn);
        tr.appendChild(tdAction);

        sourceReposBody.appendChild(tr);
    });

    runAllReposBtn.disabled = sourceRepos.length === 0;
}


// ---------- PIP Config table ----------

function renderPipConfigs() {
    pipConfigsBody.innerHTML = '';

    pipConfigs.forEach((cfg, index) => {
        const tr = document.createElement('tr');

        const tdIndex = document.createElement('td');
        tdIndex.textContent = String(index + 1);
        tr.appendChild(tdIndex);

        const tdDcc = document.createElement('td');
        tdDcc.textContent = cfg.dccName || '';
        tr.appendChild(tdDcc);

        const tdVer = document.createElement('td');
        tdVer.textContent = cfg.dccVersion || '';
        tr.appendChild(tdVer);

        const tdPath = document.createElement('td');
        tdPath.textContent = cfg.pipConfigPath || '';
        tr.appendChild(tdPath);

        const tdPackages = document.createElement('td');
        tdPackages.textContent = String((cfg.packages || []).length);
        tr.appendChild(tdPackages);

        const tdStatus = document.createElement('td');
        if (cfg.isRunning) {
            tdStatus.textContent = '⏳ Validating...';
        } else {
            tdStatus.textContent = decorateOverallStatus(cfg.overallStatus || 'Not validated');
        }
        tr.appendChild(tdStatus);

        const tdLast = document.createElement('td');
        if (cfg.lastTimestamp) {
            const d = new Date(cfg.lastTimestamp);
            tdLast.textContent = d.toLocaleString();
        } else {
            tdLast.textContent = '';
        }
        tr.appendChild(tdLast);

        const tdAction = document.createElement('td');
        const btn = document.createElement('button');
        btn.textContent = 'Run';
        btn.addEventListener('click', () => {
            onRunPipConfig(cfg);
        });
        tdAction.appendChild(btn);
        tr.appendChild(tdAction);

        pipConfigsBody.appendChild(tr);
    });

    runAllPipConfigsBtn.disabled = pipConfigs.length === 0;
}


function onRunPipConfig(cfg) {
    // mark selected config as running
    pipConfigs = pipConfigs.map(c => c.pipConfigPath === cfg.pipConfigPath
        ? { ...c, isRunning: true, overallStatus: 'Not validated' }
        : c
    );
    renderPipConfigs();

    selectedPipConfig = cfg;
    currentPackages = (cfg.packages || []).map(p => ({
        ...p,
        status: p.status || 'Not validated'
    }));

    packagesSection.style.display = 'block';
    packagesTitle.textContent = `Packages in "${cfg.dccName}"`;

    renderPackagesTable();

    vscode.postMessage({
        type: 'runPipConfig',
        payload: { pipConfigPath: cfg.pipConfigPath }
    });
}

// ---------- Packages table ----------

function renderPackagesTable() {
    packagesBody.innerHTML = '';

    currentPackages.forEach((pkg, index) => {
        const tr = document.createElement('tr');

        const tdIndex = document.createElement('td');
        tdIndex.textContent = String(index + 1);
        tr.appendChild(tdIndex);

        const tdName = document.createElement('td');
        tdName.textContent = pkg.name || '';
        tr.appendChild(tdName);

        const tdType = document.createElement('td');
        tdType.textContent = pkg.type || '';
        tr.appendChild(tdType);

        const tdUrl = document.createElement('td');
        tdUrl.textContent = pkg.url || '';
        tr.appendChild(tdUrl);

        const tdVer = document.createElement('td');
        tdVer.textContent = pkg.version || '';
        tr.appendChild(tdVer);

        const tdStatus = document.createElement('td');
        tdStatus.textContent = decorateStatus(pkg.status || 'Not validated');
        tr.appendChild(tdStatus);

        packagesBody.appendChild(tr);
    });
}

// ---------- Event wiring ----------

pickFolderBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'pickFolder' });
});

    runAllReposBtn.addEventListener('click', () => {
        if (sourceRepos.length === 0) {
            return;
        }

        // mark all repos as running
        sourceRepos = sourceRepos.map(r => ({
            ...r,
            isRunning: true,
            status: 'Validating...'
        }));
        renderSourceRepos();

        vscode.postMessage({ type: 'runAllSourceRepos' });
    });

runAllPipConfigsBtn.addEventListener('click', () => {
    if (pipConfigs.length === 0) {
        return;
    }

    // mark all PIP configs as running
    pipConfigs = pipConfigs.map(cfg => ({
        ...cfg,
        isRunning: true,
        overallStatus: 'Not validated'
    }));
    renderPipConfigs();

    vscode.postMessage({ type: 'runAllPipConfigs' });
});


// Messages from extension
window.addEventListener('message', event => {
    const msg = event.data;

    switch (msg.type) {
        case 'folderSelected': {
            const p = msg.path || '';
            folderPathEl.textContent = p || 'No folder selected.';
            statusEl.textContent = '';
            sourceRepos = [];
            pipConfigs = [];
            selectedPipConfig = null;
            currentPackages = [];
            packagesSection.style.display = 'none';
            renderSourceRepos();
            renderPipConfigs();
            break;
        }

        case 'status': {
            statusEl.textContent = msg.text || '';
            break;
        }

        case 'sourceCodeRepos': {
            const repos = Array.isArray(msg.payload) ? msg.payload : [];
            sourceRepos = repos.map(r => ({
                ...r,
                status: 'Not validated',
                severity: 'info',
                lastTimestamp: null,
                isRunning: false

            }));
            renderSourceRepos();
            break;
        }

        case 'repoStatus': {
            const payload = msg.payload;
            if (!payload || !payload.name) {
                break;
            }
            const idx = sourceRepos.findIndex(r => r.name === payload.name);
            if (idx !== -1) {
                sourceRepos[idx] = {
                    ...sourceRepos[idx],
                    status: payload.status,
                    severity: payload.severity,
                    lastTimestamp: payload.timestamp || Date.now(),
                    isRunning: false
                };
            }
            renderSourceRepos();
            break;
        }


        case 'pipConfigs': {
            const cfgs = Array.isArray(msg.payload) ? msg.payload : [];
            pipConfigs = cfgs.map(cfg => ({
                ...cfg,
                overallStatus: 'Not validated',
                lastTimestamp: null,
                isRunning: false
            }));
            renderPipConfigs();
            break;
        }

        case 'pipPackageStatus': {
            const payload = msg.payload;
            if (!payload || !selectedPipConfig) {
                break;
            }
            if (payload.pipConfigPath !== selectedPipConfig.pipConfigPath) {
                break;
            }
            const idx = currentPackages.findIndex(p => p.name === payload.pkgName);
            if (idx !== -1) {
                currentPackages[idx] = {
                    ...currentPackages[idx],
                    status: payload.status
                };
            }
            renderPackagesTable();
            break;
        }
        case 'pipConfigSummary': {
            const payload = msg.payload;
            if (!payload || !payload.pipConfigPath) {
                break;
            }
            const idx = pipConfigs.findIndex(
                c => c.pipConfigPath === payload.pipConfigPath
            );
            if (idx !== -1) {
                pipConfigs[idx] = {
                    ...pipConfigs[idx],
                    overallStatus: payload.anyIssues ? 'Issues found' : 'All OK',
                    lastTimestamp: payload.timestamp,
                    isRunning: false
                };
            }
            renderPipConfigs();
            break;
        }


    }
});







