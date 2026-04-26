interface Props {
  filesScanned: number;
  mode?: 'centered' | 'corner';
}

const formatter = new Intl.NumberFormat();

export function ProgressIndicator({ filesScanned, mode = 'corner' }: Props) {
  if (mode === 'centered') {
    return (
      <div className="scanning">
        <div className="scanning__spinner" aria-hidden="true" />
        <div>Scanning… {formatter.format(filesScanned)} files</div>
      </div>
    );
  }
  return (
    <div className="progress">
      <div className="progress__dot" aria-hidden="true" />
      <span>{formatter.format(filesScanned)} files</span>
    </div>
  );
}
