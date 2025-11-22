import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface NetrcMachine {
    login: string;
    password: string;
}

function parseNetrc(contents: string): Record<string, NetrcMachine> {
    const machines: Record<string, NetrcMachine> = {};
    const tokens = contents.split(/\s+/).filter(Boolean);

    let i = 0;
    while (i < tokens.length) {
        if (tokens[i] === "machine" && tokens[i + 1]) {
            const name = tokens[i + 1];
            let login = "";
            let password = "";
            i += 2;

            while (i < tokens.length && tokens[i] !== "machine") {
                if (tokens[i] === "login" && tokens[i + 1]) {
                    login = tokens[i + 1];
                    i += 2;
                } else if (tokens[i] === "password" && tokens[i + 1]) {
                    password = tokens[i + 1];
                    i += 2;
                } else {
                    i += 1;
                }
            }

            machines[name] = { login, password };
        } else {
            i += 1;
        }
    }

    return machines;
}

export function getNetrcCredentials(machine: string): NetrcMachine | undefined {
    const home = os.homedir();
    const candidates = [
        path.join(home, ".netrc"),
        path.join(home, "_netrc"), 
    ];

    for (const filePath of candidates) {
        if (!fs.existsSync(filePath)) {
            continue;
        }

        try {
            const raw = fs.readFileSync(filePath, "utf8");
            const machines = parseNetrc(raw);

            if (machines[machine]) {
                return machines[machine];
            }
        } catch {
            continue;
        }
    }

    return undefined;
}
