import { resolve } from "path";
import { readFileSync, existsSync } from "fs";
import { Chain, ClobClient } from "@polymarket/clob-client";
import type { ApiKeyCreds } from "@polymarket/clob-client";
import { Wallet } from "@ethersproject/wallet";
import { config } from "../utils/config";
import { createCredential } from "../security/createCredential";

// Cache for ClobClient instance to avoid repeated initialization
let cachedClient: ClobClient | null = null;
let cachedConfig: { chainId: number; host: string } | null = null;

/**
 * Initialize ClobClient from credentials (cached singleton)
 * Prevents creating multiple ClobClient instances
 * Following the pattern from sample repositories
 * Automatically creates credentials if they don't exist
 */
export async function getClobClient(): Promise<ClobClient> {
    // Load credentials
    const credentialPath = resolve(process.cwd(), "src/data/credential.json");

    // Automatically create credentials if they don't exist
    if (!existsSync(credentialPath)) {
        console.log("[INFO] Credential file not found. Creating credentials...");
        const credential = await createCredential();
        if (!credential) {
            throw new Error("Failed to create credentials. Please check your PRIVATE_KEY environment variable.");
        }
        console.log("[INFO] Credentials created successfully.");
    }

    const creds: ApiKeyCreds = JSON.parse(readFileSync(credentialPath, "utf-8"));

    const chainId = config.chain.chainId;
    const host = config.clob.apiUrl;

    // Return cached client if config hasn't changed
    if (cachedClient && cachedConfig &&
        cachedConfig.chainId === chainId &&
        cachedConfig.host === host) {
        return cachedClient;
    }

    // Create wallet from private key
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("PRIVATE_KEY not found");
    }
    const wallet = new Wallet(privateKey);

    // Convert base64url secret to standard base64 for clob-client compatibility
    const secretBase64 = creds.secret.replace(/-/g, '+').replace(/_/g, '/');

    // Create API key credentials
    const apiKeyCreds: ApiKeyCreds = {
        key: creds.key,
        secret: secretBase64,
        passphrase: creds.passphrase,
    };

    // Create and cache client
    cachedClient = new ClobClient(host, chainId, wallet, apiKeyCreds);
    cachedConfig = { chainId, host };

    return cachedClient;
}

/**
 * Clear cached ClobClient (useful for testing or re-initialization)
 */
export function clearClobClientCache(): void {
    cachedClient = null;
    cachedConfig = null;
}
