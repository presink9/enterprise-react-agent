export function Brand({ small = false }: { small?: boolean }) {
    return (
        <svg
            width={small ? 23 : 29}
            height={small ? 23 : 29}
            viewBox="0 0 32 32"
            fill="none"
            aria-hidden="true"
        >
            <path
                d="M5 7h10v7H5zM17 7h10v18H17zM5 16h10v9H5z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
            />
        </svg>
    )
}
