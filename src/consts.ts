// consts.ts
import * as os from 'os';

export const Consts = {
    DCC_VENV_CONFIG_FILE_NAME: 'pip-config.yml',
    SOURCE_CODE: 'ic-source-code.yml',
    SUB_FOLDER_VENV_CONFIGS: 'tools/venv-configs',

    
    MAX_REQUESTS_PER_HOST: 3,
    TIMEOUT_GIT_REF_CHECK: 25, // seconds
    SCAN_REPO: true,
    PARALLEL_JOBS: 3   // <= hard cap for now
} as const;

export const PIPConfigFileKeys = {
    KEY: 'packages',
    NAME: 'name',
    TYPE: 'type',
    URL: 'url',
    VERSION: 'version'
} as const;

export const ICSourceCodeFileKeys = {
    NAME: 'name',
    GIT_REF: 'git_ref',
    GIT_URL: 'git_url'
} as const;
