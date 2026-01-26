import { IconProps } from "../types";

export const Icons = {
    Terminal: ({ style, className }: IconProps = {}) => (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M5.5 4L2 8l3.5 4 1-1L3.7 8l2.8-3-1-1zm5 0l-1 1L12.3 8l-2.8 3 1 1L14 8l-3.5-4z" />
        </svg>
    ),
    Server: ({ style, className }: IconProps = {}) => (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M3.5 3A1.5 1.5 0 002 4.5v1A1.5 1.5 0 003.5 7h9A1.5 1.5 0 0014 5.5v-1A1.5 1.5 0 0012.5 3h-9zM3 4.5a.5.5 0 01.5-.5h9a.5.5 0 01.5.5v1a.5.5 0 01-.5.5h-9a.5.5 0 01-.5-.5v-1zM3.5 9A1.5 1.5 0 002 10.5v1A1.5 1.5 0 003.5 13h9a1.5 1.5 0 001.5-1.5v-1A1.5 1.5 0 0012.5 9h-9zM3 10.5a.5.5 0 01.5-.5h9a.5.5 0 01.5.5v1a.5.5 0 01-.5.5h-9a.5.5 0 01-.5-.5v-1z" />
            <circle cx="5" cy="5" r="1" />
            <circle cx="5" cy="11" r="1" />
        </svg>
    ),
    Plus: ({ style, className }: IconProps = {}) => (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M8 2a.5.5 0 01.5.5v5h5a.5.5 0 010 1h-5v5a.5.5 0 01-1 0v-5h-5a.5.5 0 010-1h5v-5A.5.5 0 018 2z" />
        </svg>
    ),
    Lock: ({ style, className }: IconProps = {}) => (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M8 1a2 2 0 012 2v4H6V3a2 2 0 012-2zm3 6V3a3 3 0 00-6 0v4a2 2 0 00-2 2v5a2 2 0 002 2h6a2 2 0 002-2V9a2 2 0 00-2-2zM5 8h6a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V9a1 1 0 011-1z" />
        </svg>
    ),
    X: ({ style, className }: IconProps = {}) => (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style={style} className={className}>
            <path d="M3.5 3.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    ),
    ChevronDown: ({ style, className }: IconProps = {}) => (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style={style} className={className}>
            <path d="M2.5 4.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
    ),
    Star: ({ style, className }: IconProps = {}) => (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M8 1.5l1.5 4h4l-3.2 2.5 1.2 4-3.5-2.5-3.5 2.5 1.2-4L2.5 5.5h4z" />
        </svg>
    ),
    Clock: ({ style, className }: IconProps = {}) => (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1 8a7 7 0 1114 0A7 7 0 011 8zm7-4a.5.5 0 01.5.5v3.5H11a.5.5 0 010 1H8a.5.5 0 01-.5-.5V4.5A.5.5 0 018 4z" />
        </svg>
    ),
    Folder: ({ style, className }: IconProps = {}) => (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M1 3.5A1.5 1.5 0 012.5 2h3.379a1.5 1.5 0 011.06.44L8.061 3.5H13.5A1.5 1.5 0 0115 5v8a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 13V3.5z" />
        </svg>
    ),
    Settings: ({ style, className }: IconProps = {}) => (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M8 4.754a3.246 3.246 0 100 6.492 3.246 3.246 0 000-6.492zM5.754 8a2.246 2.246 0 114.492 0 2.246 2.246 0 01-4.492 0z" />
            <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 01-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 01-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 01.52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 01-1.255-.52l-.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 011.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 01.52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 01-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 01-1.255-.52l-.094-.319z" />
        </svg>
    ),
    Zap: ({ style, className }: IconProps = {}) => (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M8.5 1.5a.5.5 0 00-.9-.3l-5 8a.5.5 0 00.4.8h4l-.7 4.5a.5.5 0 00.9.3l5-8a.5.5 0 00-.4-.8H7.8l.7-4.5z" />
        </svg>
    ),
    Shield: ({ style, className }: IconProps = {}) => (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M8 0c-.69 0-1.843.265-2.928.56-1.11.3-2.23.672-2.917 1.027A.5.5 0 002 2.08a23.9 23.9 0 00.102 3.01c.076.712.208 1.45.402 2.141.193.694.455 1.356.784 1.907.328.55.72 1.008 1.174 1.332.453.324.97.518 1.538.59.17.022.34.034.5.036V2.51a23.08 23.08 0 012.046-.285c.58-.05 1.12-.06 1.559-.026l.073.005.012.001A.5.5 0 0114 2.08a23.9 23.9 0 01-.102 3.01c-.076.712-.208 1.45-.402 2.141-.193.694-.455 1.356-.784 1.907-.328.55-.72 1.008-1.174 1.332-.453.324-.97.518-1.538.59a3.503 3.503 0 01-.5.036V15.5a.5.5 0 01-1 0v-4.484a4.535 4.535 0 01-1.5-.42A4.482 4.482 0 015.49 9.178a7.252 7.252 0 01-.982-2.404A22.91 22.91 0 014.11 3.06L4.1 2.83a.5.5 0 01.4-.49c.634-.127 1.31-.226 2-.285.69-.06 1.394-.08 2.086-.055l.014.001.012.001z" />
        </svg>
    ),
    Moon: ({ style, className }: IconProps = {}) => (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M6 .278a.768.768 0 01.08.858 7.208 7.208 0 00-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 01.81.316.733.733 0 01-.031.893A8.349 8.349 0 018.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 016 .278z" />
        </svg>
    ),
    Sun: ({ style, className }: IconProps = {}) => (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M8 11a3 3 0 110-6 3 3 0 010 6zm0 1a4 4 0 100-8 4 4 0 000 8zM8 0a.5.5 0 01.5.5v2a.5.5 0 01-1 0v-2A.5.5 0 018 0zm0 13a.5.5 0 01.5.5v2a.5.5 0 01-1 0v-2A.5.5 0 018 13zm8-5a.5.5 0 01-.5.5h-2a.5.5 0 010-1h2a.5.5 0 01.5.5zM3 8a.5.5 0 01-.5.5h-2a.5.5 0 010-1h2A.5.5 0 013 8zm10.657-5.657a.5.5 0 010 .707l-1.414 1.415a.5.5 0 11-.707-.708l1.414-1.414a.5.5 0 01.707 0zm-9.193 9.193a.5.5 0 010 .707L3.05 13.657a.5.5 0 01-.707-.707l1.414-1.414a.5.5 0 01.707 0zm9.193 2.121a.5.5 0 01-.707 0l-1.414-1.414a.5.5 0 01.707-.707l1.414 1.414a.5.5 0 010 .707zM4.464 4.465a.5.5 0 01-.707 0L2.343 3.05a.5.5 0 11.707-.707l1.414 1.414a.5.5 0 010 .708z" />
        </svg>
    ),
    Loader: ({ style, className }: IconProps = {}) => (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={`animate-spin ${className || ''}`}>
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2a5 5 0 110 10A5 5 0 018 3z" opacity="0.25" />
            <path d="M8 1a7 7 0 017 7h-2a5 5 0 00-5-5V1z" />
        </svg>
    ),
    Help: ({ style, className }: IconProps = {}) => (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm.01 11.5a1 1 0 110-2 1 1 0 010 2zm1.6-4.66s-.6 2.36-.73 2.66H6.66c.26-.64 1.18-2.61 1.18-2.61.32-.73 1.09-.8 1.09-1.49 0-.69-.53-1.2-1.2-1.2-.69 0-1.2.49-1.2 1.18H4.66a3 3 0 012.83-3.17c1.76-.11 3.3 1.18 3.3 2.83 0 1.05-.6 1.6-1.18 1.8z" />
        </svg>
    ),
    Download: ({ style, className }: IconProps = {}) => (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M8 12l-4-4h2.5V3h3v5H12L8 12zM4 13h8v1H4v-1z" />
        </svg>
    ),
    Edit: ({ style, className }: IconProps = {}) => (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M12.854.646a.5.5 0 00-.708 0L10.5 2.293 13.707 5.5l1.647-1.646a.5.5 0 000-.708l-2.5-2.5zm.646 6.061L9.793 3.5 3.5 9.793V13h3.207l6.293-6.293zM1 13.5A1.5 1.5 0 002.5 15h11a1.5 1.5 0 001.5-1.5v-6a.5.5 0 00-1 0v6a.5.5 0 01-.5.5h-11a.5.5 0 01-.5-.5v-11a.5.5 0 01.5-.5H9a.5.5 0 000-1H2.5A1.5 1.5 0 001 2.5v11z" />
        </svg>
    ),
    Trash: ({ style, className }: IconProps = {}) => (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z" />
            <path d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" />
        </svg>
    ),
    AlertTriangle: ({ style, className }: IconProps = {}) => (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M7.938 2.016a.146.146 0 00-.054.057L1.027 13.74a.176.176 0 00-.002.183c.016.03.037.05.076.068.039.018.09.016.124.016h13.55c.033 0 .085.002.124-.016a.16.16 0 00.076-.068.176.176 0 00-.002-.183L8.12 2.073a.146.146 0 00-.054-.057.13.13 0 00-.128 0z" />
            <path d="M8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 01-1.1 0L7.1 5.995A.905.905 0 018 5zm.002 6a1 1 0 110 2 1 1 0 010-2z" />
        </svg>
    ),
    File: ({ style, className }: IconProps = {}) => (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M4 1.5A1.5 1.5 0 002.5 3v10A1.5 1.5 0 004 14.5h8a1.5 1.5 0 001.5-1.5V6.414a1.5 1.5 0 00-.44-1.06L9.647 1.939A1.5 1.5 0 008.586 1.5H4z" />
        </svg>
    ),
    ArrowUp: ({ style, className }: IconProps = {}) => (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M3.5 8.5l4.5-5 4.5 5h-3v4h-3v-4h-3z" />
        </svg>
    ),
    Refresh: ({ style, className }: IconProps = {}) => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
            <path d="M23 4v6h-6"></path>
            <path d="M1 20v-6h6"></path>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
    ),
    Upload: ({ style, className }: IconProps = {}) => (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z" />
            <path d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708l3-3z" />
        </svg>
    ),
    FileCode: ({ style, className }: IconProps = {}) => (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M4 1.5A1.5 1.5 0 002.5 3v10A1.5 1.5 0 004 14.5h8a1.5 1.5 0 001.5-1.5V3A1.5 1.5 0 0012 1.5H4zM12 2.5a.5.5 0 01.5.5v10a.5.5 0 01-.5.5H4a.5.5 0 01-.5-.5V3a.5.5 0 01.5-.5h8z" />
            <path d="M5.5 5.5A.5.5 0 016 5h4a.5.5 0 010 1H6a.5.5 0 01-.5-.5zm0 3A.5.5 0 016 8h4a.5.5 0 010 1H6a.5.5 0 01-.5-.5zm0 3A.5.5 0 016 11h2a.5.5 0 010 1H6a.5.5 0 01-.5-.5z" />
        </svg>
    ),
    Search: ({ style, className }: IconProps = {}) => (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85a1.007 1.007 0 00-.115-.1zM12 6.5a5.5 5.5 0 11-11 0 5.5 5.5 0 0111 0z" />
        </svg>
    ),
    CaretUp: ({ style, className }: IconProps = {}) => (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M8 5l-4 4h8l-4-4z" />
        </svg>
    ),
    CaretDown: ({ style, className }: IconProps = {}) => (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M8 11l4-4H4l4 4z" />
        </svg>
    ),
    Copy: ({ style, className }: IconProps = {}) => (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M4 2a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2H4zm0 2h8v8H4V4zm-3 2a1 1 0 011-1h.5a.5.5 0 010 1H2v9a1 1 0 001 1h9a.5.5 0 010 1H3a2 2 0 01-2-2V6z" />
        </svg>
    ),
    Key: ({ style, className }: IconProps = {}) => (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M3.5 11.5a3.5 3.5 0 113.163-5H14L15.5 8 14 9.5l-1-1-1 1-1-1-1 1H6.663a3.5 3.5 0 01-3.163 2zM2.5 9a1 1 0 100-2 1 1 0 000 2z" />
        </svg>
    ),
    ChevronRight: ({ style, className }: IconProps = {}) => (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
    ),
};
