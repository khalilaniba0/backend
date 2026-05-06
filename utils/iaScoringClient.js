const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const IA_BASE_URL = process.env.IA_SERVICE_URL || process.env.IA_BASE_URL || 'http://127.0.0.1:8000';
const IA_TIMEOUT_MS = Number(process.env.IA_TIMEOUT_MS || 10000);
const IA_SCORE_TIMEOUT_MS = Number(process.env.IA_SCORE_TIMEOUT_MS || 10000);

const isNonEmptyString = (value) => {
    if (typeof value !== 'string' || value.trim().length === 0) return false;
    const normalized = value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (normalized === "non specifie" || normalized === "non precise") return false;
    return true;
};

const normalizeListField = (value) => {
    if (Array.isArray(value)) {
        return value
            .filter((item) => item !== null && item !== undefined && String(item).trim() !== '')
            .join(', ');
    }

    if (value === null || value === undefined) {
        return '';
    }
    
    // Normalize "Non spécifié" to an empty string so the IA knows it's absent
    const strValue = String(value);
    if (/^non\s+(sp[ée]cifi[ée]|pr[ée]cis[ée])$/i.test(strValue.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) {
        return '';
    }

    return strValue;
};

const pickIaErrorMessage = (payload, fallback) => {
    if (isNonEmptyString(payload)) {
        return payload.trim();
    }

    if (payload && typeof payload === 'object') {
        if (isNonEmptyString(payload.error)) return payload.error.trim();
        if (isNonEmptyString(payload.message)) return payload.message.trim();
    }

    return fallback;
};

const createIaError = (message, status = null, details = null, cause = null) => {
    const error = new Error(message);
    error.status = status;
    error.details = details;
    if (cause) error.cause = cause;
    return error;
};

const normalizeAxiosError = (error, endpointLabel) => {
    const status = error?.response?.status || null;
    const details = error?.response?.data || null;
    const isTimeout = error?.code === 'ECONNABORTED' || /timeout/i.test(String(error?.message || ''));

    if (isTimeout) {
        return createIaError('Service IA indisponible', status, details, error);
    }

    if (status) {
        const message = pickIaErrorMessage(details, `Erreur IA (${status}) sur ${endpointLabel}`);
        return createIaError(message, status, details, error);
    }

    return createIaError('Service IA indisponible', null, null, error);
};

const isIaServiceUnavailable = (error) => {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    const isTimeout = code === 'ECONNABORTED' || /timeout/i.test(message);
    const hasNoResponse = !error?.response && error?.status === undefined;

    return isTimeout || hasNoResponse;
};

const toProcessJobPayload = (offre = {}) => {
    return {
        description: normalizeListField(offre.description),
        langues: normalizeListField(offre.langues),
        exigences: normalizeListField(offre.exigences),
        niveauExperience: normalizeListField(offre.niveauExperience),
        niveauEducation: normalizeListField(offre.niveauEducation)
    };
};

const toScorePayload = (offre = {}) => {
    const languesRaw = normalizeListField(offre.langues);

    return {
        titre: normalizeListField(offre.poste !== undefined ? offre.poste : offre.post),
        description: normalizeListField(offre.description),
        exigences: normalizeListField(
            offre.requirements !== undefined ? offre.requirements : offre.exigences
        ),
        niveauExperience: isNonEmptyString(offre.niveauExperience)
            ? offre.niveauExperience.trim()
            : null,
        niveauEducation: isNonEmptyString(offre.niveauEducation)
            ? offre.niveauEducation.trim()
            : null,
        langues: isNonEmptyString(languesRaw) ? languesRaw : null
    };
};

const processOffer = async (offre = {}) => {
    const payload = toProcessJobPayload(offre);

    try {
        const response = await axios.post(`${IA_BASE_URL}/api/process-job`, payload, {
            timeout: IA_TIMEOUT_MS,
            headers: { 'Content-Type': 'application/json' }
        });

        const body = response?.data;
        if (body?.success === true && body?.data && typeof body.data === 'object') {
            return body.data;
        }

        const message = pickIaErrorMessage(body, 'Reponse invalide du service IA sur /api/process-job');
        throw createIaError(message, response?.status || null, body || null);
    } catch (error) {
        if (error?.status !== undefined) {
            throw error;
        }
        throw normalizeAxiosError(error, '/api/process-job');
    }
};

const matchCv = async (cvBuffer, cvFilename, processedJob) => {
    if (!Buffer.isBuffer(cvBuffer)) {
        throw createIaError('cvBuffer invalide pour le scoring IA');
    }

    if (!processedJob || typeof processedJob !== 'object') {
        throw createIaError('processedJob invalide pour le scoring IA');
    }

    const fileName = isNonEmptyString(cvFilename) ? cvFilename.trim() : 'cv.pdf';

    const form = new FormData();
    form.append('cv', cvBuffer, {
        filename: fileName,
        contentType: 'application/pdf'
    });
    form.append('processed_job', JSON.stringify(processedJob));

    try {
        const response = await axios.post(`${IA_BASE_URL}/api/match-cv`, form, {
            timeout: IA_TIMEOUT_MS,
            headers: form.getHeaders(),
            maxBodyLength: Infinity,
            maxContentLength: Infinity
        });

        if (response?.data?.status === 'out_of_scope') {
            return {
                out_of_scope: true,
                reason: response?.data?.reason || 'CV hors domaine IT'
            };
        }

        if (response?.status === 200) {
            return response.data;
        }

        const message = pickIaErrorMessage(
            response?.data,
            'Reponse invalide du service IA sur /api/match-cv'
        );
        throw createIaError(message, response?.status || null, response?.data || null);
    } catch (error) {
        const status = error?.response?.status || null;
        const details = error?.response?.data || null;

        if (status === 400 && details?.status === 'out_of_scope') {
            return {
                out_of_scope: true,
                reason: details?.reason || 'CV hors domaine IT'
            };
        }

        if (error?.status !== undefined) {
            throw error;
        }

        throw normalizeAxiosError(error, '/api/match-cv');
    }
};

const scorerCV = async (cvFilePath, offre = {}) => {
    if (!isNonEmptyString(cvFilePath)) {
        throw createIaError('cvFilePath invalide pour le scoring IA');
    }

    if (!offre || typeof offre !== 'object') {
        throw createIaError('offre invalide pour le scoring IA');
    }

    const resolvedCvPath = path.resolve(cvFilePath);
    if (!fs.existsSync(resolvedCvPath)) {
        throw createIaError('Fichier CV introuvable pour le scoring IA', null, {
            cvFilePath: resolvedCvPath
        });
    }

    let cvBuffer;
    try {
        cvBuffer = fs.readFileSync(resolvedCvPath);
    } catch (readError) {
        throw createIaError('Lecture du CV impossible pour le scoring IA', null, {
            cvFilePath: resolvedCvPath
        }, readError);
    }

    const payloadOffre = toScorePayload(offre);
    const form = new FormData();
    form.append('cv_file', cvBuffer, {
        filename: path.basename(resolvedCvPath) || 'cv.pdf',
        contentType: 'application/pdf'
    });
    form.append('offre', JSON.stringify(payloadOffre));

    try {
        const response = await axios.post(`${IA_BASE_URL}/score`, form, {
            timeout: IA_SCORE_TIMEOUT_MS,
            headers: form.getHeaders(),
            maxBodyLength: Infinity,
            maxContentLength: Infinity
        });

        if (response?.status === 200 && response?.data) {
            return response.data;
        }

        const message = pickIaErrorMessage(
            response?.data,
            'Reponse invalide du service IA sur /score'
        );
        throw createIaError(message, response?.status || null, response?.data || null);
    } catch (error) {
        const status = error?.response?.status || null;
        const details = error?.response?.data || null;

        if (isIaServiceUnavailable(error)) {
            console.warn('[IA] /score indisponible, fallback score null', {
                code: error?.code || null,
                message: error?.message || null
            });

            return {
                score_global: null,
                fallback: true,
                reason: 'Service IA indisponible'
            };
        }

        if (status === 422) {
            console.error('[IA] /score validation-422', {
                detail: details?.detail || details,
                offrePayload: payloadOffre
            });
        }

        if (error?.status !== undefined) {
            throw error;
        }

        throw normalizeAxiosError(error, '/score');
    }
};

module.exports = {
    processOffer,
    matchCv,
    scorerCV
};
