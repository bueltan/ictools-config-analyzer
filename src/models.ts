// models.ts

// models.ts
export interface PackageInfo {
    name: string;
    type: string;
    url: string;
    version: string;
    valid?: boolean | null;
    errorMessage?: string;
    timestamp?: number | null;
    status?: string;      
}
export interface PiPConfigInfo {
    dccName: string;
    dccVersion: string;
    pipConfigPath: string;
    errorMessages: string[];
    timestamp?: number | null;
    valid?: boolean | null;
    analyze: boolean;
    packages: PackageInfo[];
}

export interface Package {
    name: string;
    type: string;
    url: string;
    version: string;
    valid?: boolean | null;
    error_message?: string;
    timestamp?: number | null;
}

export interface Repository {
    name: string;
    git_ref: string;
    git_url: string;
    valid?: boolean | null;
    error_message?: string;
    timestamp?: number | null;
}

export interface PiPConfig {
    dcc_name: string;
    dcc_version: string;
    pip_config_path: string;
    error_messages: string[];
    timestamp?: number | null;
    valid?: boolean | null;
    analyze: boolean;
    packages: Package[];
}

export interface SourceCodeConfig {
    error_messages: string[];
    valid?: boolean | null;
    analyze: boolean;
    timestamp?: number | null;
    repositories: Repository[];
}
