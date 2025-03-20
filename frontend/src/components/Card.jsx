function timeRemaining(deadlineInSeconds) {
    const now = Math.floor(Date.now() / 1000); // Current time in seconds
    let remaining = deadlineInSeconds - now;

    if (remaining <= 0) {
        return {days:0, hours:0, minutes:0, seconds:0};
    }

    const days = Math.floor(remaining / (24 * 3600));
    remaining %= 24 * 3600;  // Factor out days
    const hours = Math.floor(remaining / 3600);
    remaining %= 3600;  // Factor out hours
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;

    return {days, hours, minutes, seconds};
}

function getPercentage(part, total) {
    if (total === 0) return null;
    return Math.floor((part / total) * 100);
}

function Card({id, creator, metadataUrl, goal, deadline, fundsRaised, totalContributors}){
	return (
		<div className="card">
            <a href="#">
                <img id="card-img" src="campaign1.jpg" alt="logo"/>
            </a>
            <div id="card-info">
                <h3>By: {creator.slice(0, 5) + "....." + creator.slice(37)}</h3>
                <p>Are we in time to reverse our environmental impact on the planet and preserve its regenerative capacity?</p>
                <ul>
                    <li><strong>{fundsRaised.toString()} eth</strong><br />raised</li>
                    {/* If days < 0, show hours. You get it. */}
                    <li><strong>{timeRemaining(deadline.toString()).days} days</strong><br />remaining</li>
                </ul>
                <progress value={fundsRaised.toString()} max={goal.toString()} />
                <p>{getPercentage(fundsRaised.toString(), goal.toString())}% financed</p>
            </div>
        </div>
	)
}

export default Card