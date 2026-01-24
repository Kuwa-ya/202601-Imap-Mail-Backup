export type RulesConfig = {
	allowedExtensions?: string[];
	blockedExtensions?: string[];
	maxFileSizeMB?: number;
};

export function isExtensionAllowed(filename: string | undefined, rules: RulesConfig) {
	if (!filename) return false;
	const ext = (filename.match(/(\.[^.]*)$/) || [''])[0].toLowerCase();
	if (rules.blockedExtensions && rules.blockedExtensions.some(b => b.toLowerCase() === ext)) return false;
	if (rules.allowedExtensions && rules.allowedExtensions.length > 0) {
		return rules.allowedExtensions.map(x => x.toLowerCase()).includes(ext);
	}
	return true;
}

export function isSizeAllowed(sizeBytes: number | undefined, rules: RulesConfig) {
	if (!sizeBytes) return true;
	if (!rules.maxFileSizeMB) return true;
	return sizeBytes <= rules.maxFileSizeMB * 1024 * 1024;
}

export function shouldSaveAttachment(filename: string | undefined, sizeBytes: number | undefined, rules: RulesConfig) {
	return isExtensionAllowed(filename, rules) && isSizeAllowed(sizeBytes, rules);
}
