import logoUrl from '../sheeter-logo.svg?url'

type LogoProps = {
  className?: string
  markClassName?: string
  textClassName?: string
  showText?: boolean
}

export function Logo({
  className = '',
  markClassName = 'h-7 w-7 rounded-md',
  textClassName = 'font-mono text-sm tracking-tight text-[#f0ede6]',
  showText = true,
}: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`.trim()}>
      <img src={logoUrl} alt="" aria-hidden="true" className={markClassName} />
      {showText ? (
        <span className={textClassName}>
          sheeter<span className="text-[#c9964a]">.</span>
        </span>
      ) : null}
    </span>
  )
}
