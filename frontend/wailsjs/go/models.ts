export namespace main {
	
	export class FetchConfigResult {
	    content: string;
	
	    static createFrom(source: any = {}) {
	        return new FetchConfigResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.content = source["content"];
	    }
	}
	export class TestConnectionResult {
	    ok: boolean;
	    message: string;
	    latencyMs?: number;
	
	    static createFrom(source: any = {}) {
	        return new TestConnectionResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.message = source["message"];
	        this.latencyMs = source["latencyMs"];
	    }
	}

}

export namespace profile {
	
	export class SaveProfileRequest {
	    id?: string;
	    name: string;
	    host: string;
	    port: number;
	    username: string;
	    authType: string;
	    keyPath?: string;
	    configPath: string;
	    backupKeep: number;
	    restartScript: string;
	    healthCheckUrl?: string;
	    validateRemote: boolean;
	    password?: string;
	    passphrase?: string;
	
	    static createFrom(source: any = {}) {
	        return new SaveProfileRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.username = source["username"];
	        this.authType = source["authType"];
	        this.keyPath = source["keyPath"];
	        this.configPath = source["configPath"];
	        this.backupKeep = source["backupKeep"];
	        this.restartScript = source["restartScript"];
	        this.healthCheckUrl = source["healthCheckUrl"];
	        this.validateRemote = source["validateRemote"];
	        this.password = source["password"];
	        this.passphrase = source["passphrase"];
	    }
	}
	export class ServerProfile {
	    id: string;
	    name: string;
	    host: string;
	    port: number;
	    username: string;
	    authType: string;
	    keyPath?: string;
	    hasPassphrase?: boolean;
	    configPath: string;
	    backupKeep: number;
	    restartScript: string;
	    healthCheckUrl?: string;
	    validateRemote: boolean;
	    // Go type: time
	    createdAt: any;
	    // Go type: time
	    updatedAt: any;
	
	    static createFrom(source: any = {}) {
	        return new ServerProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.username = source["username"];
	        this.authType = source["authType"];
	        this.keyPath = source["keyPath"];
	        this.hasPassphrase = source["hasPassphrase"];
	        this.configPath = source["configPath"];
	        this.backupKeep = source["backupKeep"];
	        this.restartScript = source["restartScript"];
	        this.healthCheckUrl = source["healthCheckUrl"];
	        this.validateRemote = source["validateRemote"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.updatedAt = this.convertValues(source["updatedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace syncer {
	
	export class BackupInfo {
	    name: string;
	    size: number;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new BackupInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.size = source["size"];
	        this.createdAt = source["createdAt"];
	    }
	}

}

