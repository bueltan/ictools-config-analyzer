import { PiPConfigInfo } from '../models';
import { checkPackageVersion } from './packageValidator';

export async function validatePipConfigPackages(
    cfg: PiPConfigInfo,
    post: (msg: any) => void
): Promise<{ anyIssues: boolean }> {
    const packages = cfg.packages || [];
    let anyIssues = false;

    for (const pkg of packages) {
        const updated = await checkPackageVersion(pkg);
        if (!updated.valid) {
            anyIssues = true;
        }
        post({
            type: 'pipPackageStatus',
            payload: {
                pipConfigPath: cfg.pipConfigPath,
                pkgName: updated.name,
                status: updated.status,
                valid: updated.valid
            }
        });
    }

    return { anyIssues };
}
